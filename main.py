import os
import re
import asyncio
import threading
import traceback
import time
from collections import deque
from datetime import datetime, timezone, timedelta
from urllib.parse import unquote
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from telethon import TelegramClient, events, errors
from telethon.sessions import StringSession
from telethon.tl.types import MessageMediaDocument, MessageMediaPhoto
from telethon.tl.types import DocumentAttributeFilename, DocumentAttributeVideo

# --- Configuración ---

API_ID = int(os.getenv("API_ID", "0"))
API_HASH = os.getenv("API_HASH", "")
# Asegúrate de que esta URL sea correcta para los archivos
PUBLIC_URL = os.getenv("PUBLIC_URL", "https://consulta-pe-bot.up.railway.app").rstrip("/")
SESSION_STRING = os.getenv("SESSION_STRING", None)
PORT = int(os.getenv("PORT", 8080))

DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Lista de bots públicos para la extracción de videos
PUBLIC_VIDEO_BOTS = [
    "@Peliculas_HD_4K",
    "@Videos_publicos_pe",
    "@Educacion_pe",
    "@Turismo_pe",
    "@Musica_pe",
    # Agrega más bots aquí
]

# Tiempo de espera total para la llamada a la API de búsqueda.
TIMEOUT_TOTAL = 45 

# --- Aplicación Flask ---

app = Flask(__name__)
CORS(app)

# --- Bucle Asíncrono para Telethon ---

loop = asyncio.new_event_loop()
# Inicializa el bucle de eventos en un hilo separado
threading.Thread(
    target=lambda: (asyncio.set_event_loop(loop), loop.run_forever()), daemon=True
).start()

def run_coro(coro):
    """Ejecuta una corrutina en el bucle principal y espera el resultado."""
    # Usamos el TIMEOUT_TOTAL para la espera externa
    return asyncio.run_coroutine_threadsafe(coro, loop).result(timeout=TIMEOUT_TOTAL + 5) 

# --- Configuración del Cliente Telegram ---

if SESSION_STRING and SESSION_STRING.strip():
    session = StringSession(SESSION_STRING)
    print("🔑 Usando SESSION_STRING desde variables de entorno")
else:
    # Usa un nombre de archivo si quieres persistencia local sin SESSION_STRING
    session = "video_extractor_session" 
    print("📂 Usando sesión 'video_extractor_session'")

client = TelegramClient(session, API_ID, API_HASH, loop=loop)

# Mensajes en memoria (usaremos esto como caché de videos recientes)
# Almacenará objetos de video
messages = deque(maxlen=500)
_messages_lock = threading.Lock()

# Caché de IDs de entidades de los bots
BOT_ENTITIES = {}

async def _get_bot_entities():
    """Obtiene los IDs de las entidades de los bots públicos una sola vez."""
    global BOT_ENTITIES
    if BOT_ENTITIES:
        return
    
    print("Resolviendo entidades de bots...")
    for bot_name in PUBLIC_VIDEO_BOTS:
        try:
            entity = await client.get_entity(bot_name)
            BOT_ENTITIES[entity.id] = bot_name
            print(f"  ✅ {bot_name} resuelto a ID: {entity.id}")
        except Exception as e:
            print(f"  ❌ Error al obtener entidad para {bot_name}: {e}")
    print("Entidades de bots resueltas.")
    
# --- Función de Extracción de Metadatos de Video ---

def _extract_video_metadata(message):
    """Extrae metadatos de un objeto MessageMediaDocument que es un video."""
    media = message.media
    if not isinstance(media, MessageMediaDocument):
        return None

    document = media.document
    
    # 1. Verificar si es un video
    is_video = any(isinstance(attr, DocumentAttributeVideo) for attr in document.attributes)
    if not is_video:
        return None

    # 2. Extraer metadatos
    video_attr = next((attr for attr in document.attributes if isinstance(attr, DocumentAttributeVideo)), None)
    
    file_attr = next((attr for attr in document.attributes if isinstance(attr, DocumentAttributeFilename)), None)
    
    filename = getattr(file_attr, 'file_name', 'video_file')
    caption = message.message or filename # Usar el caption o el nombre de archivo

    return {
        "id": document.id,
        "caption": caption,
        "width": getattr(video_attr, 'w', None),
        "height": getattr(video_attr, 'h', None),
        "duration": getattr(video_attr, 'duration', None),
        "mime_type": document.mime_type,
        "size": document.size,
        # Guardar date en formato ISO 8601
        "date": message.date.isoformat() if message.date else datetime.utcnow().isoformat(), 
        "channel_id": message.chat_id,
        "file_reference": document.file_reference.hex() if document.file_reference else None,
        "file_name": filename
    }

# --- Handler de nuevos mensajes (Cache de videos recientes) ---

async def _on_new_message(event):
    """Intercepta mensajes de bots públicos con videos y los cachea."""
    
    # 1. Asegurarse de tener las entidades de los bots
    if not BOT_ENTITIES:
        # Intenta obtener entidades si el cliente está autorizado (por si falla el inicio)
        if await client.is_user_authorized():
            await _get_bot_entities()
        else:
             return # No procesar si no está autorizado
    
    # 2. Verificar si el mensaje viene de alguno de los bots de la lista
    sender_is_video_bot = event.sender_id in BOT_ENTITIES

    if not sender_is_video_bot:
        return # Ignorar mensajes que no sean de los bots de video
        
    # 3. Extraer metadatos del video si es un video
    if getattr(event, "message", None) and getattr(event.message, "media", None):
        video_metadata = _extract_video_metadata(event.message)
        
        if video_metadata:
            
            # Construir la URL de descarga local (la descarga real se hace en la ruta HTTP)
            # Usaremos el ID del documento y el nombre de archivo para la URL
            video_metadata["download_url"] = f"{PUBLIC_URL}/videos/download/{video_metadata['id']}/{video_metadata['file_name']}"
            
            # Agregar el nombre del bot
            video_metadata["bot_name"] = BOT_ENTITIES.get(event.sender_id, "Unknown_Bot")
            
            # 4. Agregar a la cola de historial (videos recientes)
            with _messages_lock:
                # Evitar duplicados
                if not any(msg['id'] == video_metadata['id'] for msg in messages):
                    messages.appendleft(video_metadata)
                    print(f"✨ Video cacheado de {video_metadata['bot_name']}: {video_metadata['caption'][:30]}...")

    except Exception:
        traceback.print_exc() 

client.add_event_handler(_on_new_message, events.NewMessage(incoming=True))

# --- Rutina de conexión y entidad inicial ---

async def _ensure_connected_and_entities():
    """Mantiene la conexión y resuelve las entidades al inicio."""
    while True:
        try:
            if not client.is_connected():
                print("🔌 Intentando reconectar Telethon...")
                await client.connect()
            
            if client.is_connected() and not await client.is_user_authorized():
                 print("⚠️ Telethon conectado, pero no autorizado. Reintentando auth...")
                 try:
                    await client.start()
                 except Exception:
                     pass

            if await client.is_user_authorized():
                await _get_bot_entities() # Resolver/obtener entidades
                # Un ping simple para mantener viva la conexión
                await client.get_dialogs(limit=1) 
                print("✅ Reconexión y verificación de bots exitosa.")
            else:
                 print("🔴 Cliente no autorizado. Requerido /login.")


        except Exception:
            # tracebox.print_exc() # Corregido: error tipográfico a 'traceback.print_exc()'
            traceback.print_exc()
        await asyncio.sleep(300) # Dormir 5 minutos

# Ejecutar la rutina de conexión/mantenimiento en el bucle de Telethon
asyncio.run_coroutine_threadsafe(_ensure_connected_and_entities(), loop)

# --- Rutas HTTP ---

@app.route("/")
def root():
    return jsonify({
        "status": "ok",
        "message": "Gateway API para Extractor de Videos Públicos activo.",
        "endpoints": {
            "/videos/recent": "Obtener los videos más recientes de los bots configurados.",
            "/videos/search?query=<query>": "Buscar videos por título/descripción en los bots.",
            "/videos/download/<doc_id>/<filename>": "Descargar un video (URL devuelta en /search o /recent)."
        },
        "bots_configurados": PUBLIC_VIDEO_BOTS
    })

# --- Ruta para videos recientes (Extracción automática) ---

@app.route("/videos/recent", methods=["GET"])
def get_recent_videos():
    """Devuelve los videos más recientes cacheado por el handler."""
    with _messages_lock:
        data = list(messages)
        
    # Aplicar paginación simple (si se necesita)
    limit = int(request.args.get("limit", 20))
    
    return jsonify({
        "status": "ok",
        "message": f"Mostrando los últimos {min(limit, len(data))} videos cacheado(s).",
        "result": data[:limit]
    })

# --- Ruta para búsqueda de videos por query ---

@app.route("/videos/search", methods=["GET"])
def search_videos():
    """Busca videos en los bots públicos por título/descripción."""
    
    query = request.args.get("query")
    if not query or not query.strip():
        return jsonify({"status": "error", "message": "Parámetro 'query' es requerido para la búsqueda."}), 400
    
    async def _search_all_bots():
        
        if not BOT_ENTITIES:
            await _get_bot_entities()
        
        # Obtenemos los IDs de los canales
        channel_ids = list(BOT_ENTITIES.keys())
        
        all_results = []
        tasks = []
        
        # Función para buscar en un bot específico
        async def _search_in_bot(channel_id):
            bot_name = BOT_ENTITIES.get(channel_id, str(channel_id))
            try:
                # Usar client.get_messages con la opción 'search'
                # Limitamos la búsqueda a los últimos 50 mensajes por bot para evitar timeouts
                messages = await client.get_messages(channel_id, limit=50, search=query)
                
                bot_results = []
                for msg in messages:
                    if msg.media:
                        metadata = _extract_video_metadata(msg)
                        if metadata:
                            metadata["bot_name"] = bot_name
                            metadata["download_url"] = f"{PUBLIC_URL}/videos/download/{metadata['id']}/{metadata['file_name']}"
                            bot_results.append(metadata)
                
                return bot_results

            except errors.ChannelPrivateError:
                print(f"⚠️ El bot/canal {bot_name} es privado o no existe.")
                return []
            except Exception as e:
                print(f"❌ Error buscando en {bot_name}: {e}")
                return []

        # Crear tareas de búsqueda para todos los bots
        for channel_id in channel_ids:
            tasks.append(_search_in_bot(channel_id))

        # Ejecutar todas las búsquedas concurrentemente
        results = await asyncio.gather(*tasks)
        
        # Consolidar resultados
        for res_list in results:
            all_results.extend(res_list)
            
        return all_results

    try:
        results = run_coro(_search_all_bots())
        
        return jsonify({
            "status": "ok",
            "message": f"Búsqueda exitosa. {len(results)} videos encontrados para '{query}'.",
            "query": query,
            "result": results
        })
        
    except Exception as e:
        return jsonify({"status": "error", "message": f"Error en la búsqueda: {str(e)}"}), 500

# --- Ruta de descarga de videos ---

@app.route("/videos/download/<int:doc_id>/<path:filename>", methods=["GET"])
def download_video(doc_id, filename):
    """
    Ruta para descargar archivos de video usando el ID del documento.
    """
    
    # El nombre de archivo real en disco
    local_filename = f"{doc_id}_{filename}"
    local_path = os.path.join(DOWNLOAD_DIR, local_filename)

    # Si el archivo ya existe localmente, lo enviamos directamente
    if os.path.exists(local_path):
        return send_from_directory(DOWNLOAD_DIR, local_filename, as_attachment=True, download_name=filename)

    # Si no existe, debemos intentar la descarga usando el ID del documento
    async def _download_file():
        try:
            # Buscamos en la cola de mensajes si tenemos un mensaje con ese doc_id
            with _messages_lock:
                video_meta = next((msg for msg in messages if msg['id'] == doc_id), None)
            
            # Optamos por la descarga por ID/referencia. Necesitamos el document.id y file_reference
            
            if video_meta and video_meta.get('file_reference'):
                # Si tenemos la referencia, usamos el constructor de Document
                from telethon.tl.types import Document
                document = Document(
                    id=doc_id,
                    access_hash=0, # access_hash puede ser 0 si se usa file_reference
                    file_reference=bytes.fromhex(video_meta['file_reference']),
                    date=datetime.now(timezone.utc),
                    mime_type=video_meta['mime_type'],
                    size=video_meta['size'],
                    dc_id=0, # Telethon lo resuelve
                    attributes=[DocumentAttributeFilename(file_name=filename)]
                )
                
                # Intentamos descargar directamente el Documento
                print(f"Descargando video {doc_id} con file_reference...")
                saved_path = await client.download_media(document, file=local_path)
                return saved_path
            
            else:
                 # Si no tenemos la referencia, no se puede descargar de forma fiable.
                 print(f"Error: Video {doc_id} no encontrado en cache o falta file_reference. No se puede descargar sin él.")
                 return None

        except Exception as e:
            print(f"Error al descargar media {doc_id}: {e}")
            return None

    try:
        # Esto iniciará la descarga si el archivo no existe
        saved_path = run_coro(_download_file())
        
        if saved_path:
            # Reintentar enviar el archivo
            return send_from_directory(DOWNLOAD_DIR, local_filename, as_attachment=True, download_name=filename)
        else:
            return jsonify({"status": "error", "message": "Archivo no accesible o no se pudo descargar (referencia de archivo no encontrada)."}), 404
            
    except Exception as e:
        return jsonify({"status": "error", "message": f"Error interno en la descarga: {str(e)}"}), 500


# ----------------------------------------------------------------------
# --- Rutas HTTP Base (Login/Status) Mantenidas para la sesión de Telethon ---
# ----------------------------------------------------------------------

# Variables de estado para el login
pending_phone = {"phone": None, "sent_at": None}

@app.route("/status")
def status():
    try:
        is_auth = run_coro(client.is_user_authorized())
    except Exception:
        is_auth = False

    current_session = None
    try:
        if is_auth:
            current_session = client.session.save()
    except Exception:
        pass
    
    # Agregar estado de los bots
    bot_status = {
        name: {"resolved": id_ in BOT_ENTITIES} 
        for id_, name in BOT_ENTITIES.items()
    }
    
    return jsonify({
        "authorized": bool(is_auth),
        "session_loaded": True if SESSION_STRING else False,
        "session_string_start": current_session[:20] if current_session else None,
        "cached_videos": len(messages),
        "bot_entities": bot_status,
        "bots_configurados": PUBLIC_VIDEO_BOTS,
    })

@app.route("/login")
def login():
    phone = request.args.get("phone")
    if not phone: return jsonify({"error": "Falta parámetro phone"}), 400

    async def _send_code():
        await client.connect()
        if await client.is_user_authorized(): return {"status": "already_authorized"}
        try:
            await client.send_code_request(phone)
            pending_phone["phone"] = phone
            pending_phone["sent_at"] = datetime.utcnow().isoformat()
            return {"status": "code_sent", "phone": phone}
        except Exception as e: return {"status": "error", "error": str(e)}

    result = run_coro(_send_code())
    return jsonify(result)

@app.route("/code")
def code():
    code = request.args.get("code")
    if not code: return jsonify({"error": "Falta parámetro code"}), 400
    if not pending_phone["phone"]: return jsonify({"error": "No hay login pendiente"}), 400

    phone = pending_phone["phone"]
    async def _sign_in():
        try:
            await client.sign_in(phone, code)
            await client.start()
            pending_phone["phone"] = None
            pending_phone["sent_at"] = None
            new_string = client.session.save()
            return {"status": "authenticated", "session_string": new_string}
        except errors.SessionPasswordNeededError: return {"status": "error", "error": "2FA requerido"}
        except Exception as e: return {"status": "error", "error": str(e)}

    result = run_coro(_sign_in())
    return jsonify(result)


# ----------------------------------------------------------------------
# --- Inicialización del Cliente Telethon (Manejado por Gunicorn) ------
# ----------------------------------------------------------------------

# Ejecutar la conexión y el inicio de sesión del cliente al cargar el archivo
# Esto asegura que Gunicorn tenga la aplicación Flask lista y Telethon en segundo plano.
print("🚀 Inicializando cliente Telethon y conexión...")
try:
    run_coro(client.connect())
    # Intentar iniciar la sesión (si es persistente)
    if not run_coro(client.is_user_authorized()):
        # Solo intentar start() si no está autorizado
         run_coro(client.start()) 
         
    # Resolver entidades al inicio
    run_coro(_get_bot_entities())
    print("✅ Cliente Telethon conectado y listo.")

except Exception as e:
    print(f"❌ Error crítico al iniciar Telethon: {e}")
    print("La aplicación seguirá ejecutándose, pero las funciones de Telegram no funcionarán.")
    
# La aplicación 'app' de Flask es el objeto que Gunicorn buscará y usará para servir las rutas.

# NOTA: La línea app.run(...) ya NO se usa aquí. Gunicorn se encarga de servir la aplicación.

