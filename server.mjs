import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import qrcode from "qrcode";
import fs from "fs";
import path from "path";
import qs from "qs"; // Importar qs para manejar query strings de forma segura

dotenv.config();

const app = express();
// Configurar CORS para permitir peticiones desde cualquier origen para los nuevos endpoints
app.use(cors({ origin: "*" })); 
app.use(express.json()); // Middleware para parsear bodies en formato JSON

// Configuración global para la respuesta a los clientes
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "51929008609"; // Número principal del admin

const sessions = new Map();
const userStates = new Map(); // Para almacenar el estado de la conversación por usuario

// Estado del bot
let botPaused = false;
let activeAI = "local"; // Forzamos el modo local como predeterminado
let welcomeMessage = "¡Hola! ¿Cómo puedo ayudarte hoy? Te recuerdo que el asistente de Consulta PE ahora tiene respuestas instantáneas. 😉";

// --- Datos Fijos de Paquetes y Pago ---
const PACKAGES = {
    '10': { amount: 10, credits: 60, qr_key: 'LEMON_QR_IMAGE', yape_num: 'YAPE_NUMBER', name: 'Paquete de S/10 (60 créditos ⚡)' },
    '20': { amount: 20, credits: 125, qr_key: 'LEMON_QR_IMAGE', yape_num: 'YAPE_NUMBER', name: 'Paquete de S/20 (125 créditos 🚀)' },
    '50': { amount: 50, credits: 330, qr_key: 'LEMON_QR_IMAGE', yape_num: 'YAPE_NUMBER', name: 'Paquete de S/50 (330 créditos 💎)' },
    '100': { amount: 100, credits: 700, qr_key: 'LEMON_QR_IMAGE', yape_num: 'YAPE_NUMBER', name: 'Paquete de S/100 (700 créditos 👑)' },
    '200': { amount: 200, credits: 1500, qr_key: 'LEMON_QR_IMAGE', yape_num: 'YAPE_NUMBER', name: 'Paquete de S/200 (1500 créditos 🔥)' },
};

// Prompt de Yape para envío de QR (se asume que YAPE_NUMBER y QR_IMAGE están en .env)
const YAPE_PROMPT = `
¡Listo, leyenda! Elegiste el *Paquete de {{monto}} soles* con *{{creditos}} créditos*.

Escanea el QR y paga directo por Yape.

*Monto:* S/{{monto}}
*Créditos:* {{creditos}}
*Yape:* {{numero_yape}}
*Titular:* José R. Cubas

Una vez que pagues, envía el *comprobante* y tu *correo* registrado en la app. Te activamos los créditos al toque. No pierdas tiempo.
`;

// Respuestas Fijas para compra (Se priorizarán sobre la IA/Local)
const RESPONSE_PAQUETES = `
💰 *Paquetes disponibles:*

MONTO (S/)	         CRÉDITOS
10	                               60 ⚡
20                             	 125 🚀
50	                               330 💎
100	                            700 👑
200	                            1500 🔥

✨ *Ventaja premium:* Tus créditos jamás caducan. Lo que compras, es tuyo para siempre.

🎁 Y porque me caes bien: Por la compra de cualquier paquete te voy a añadir *3 créditos extra de yapa*.
\n\n*Para comprar, simplemente dime el monto (ej. '10', '50') o 'Paquete de 10'.*
`;

const RESPONSE_METODO_PAGO = `
💳 *Métodos de Pago:*
Pagamos como VIP: *Yape*, *Lemon Cash*, *Bim*, *PayPal* o depósito directo.

Si no tienes ninguno, puedes pagar en una farmacia, agencia bancaria o pedirle a un amigo. Cuando uno quiere resultados, no pone excusas.

*Para Yape o Plin, dime el monto exacto del paquete que deseas (ej. '10' o 'Paquete de 10').*
`;

// Respuestas locales para el bot (Se eliminan los prompts de IA)
let respuestasPredefinidas = {
    // Coincidencias para mostrar paquetes (50% de coincidencia)
    "quiero comprar créditos": RESPONSE_PAQUETES,
    "necesito créditos": RESPONSE_PAQUETES,
    "quiero el acceso": RESPONSE_PAQUETES,
    "me interesa la app completa": RESPONSE_PAQUETES,
    "dame acceso completo": RESPONSE_PAQUETES,
    "hola, quiero comprar créditos para consulta pe. ¿me puedes dar información?": RESPONSE_PAQUETES,

    // Coincidencias para mostrar métodos de pago (50% de coincidencia)
    "dónde pago": RESPONSE_METODO_PAGO,
    "cómo compro eso": RESPONSE_METODO_PAGO,
    "cómo lo relaizo el pago": RESPONSE_METODO_PAGO,
    "a qué número yapeo o plineo": RESPONSE_METODO_PAGO,
    "métodos de pago": RESPONSE_METODO_PAGO,
    "formas de pago": RESPONSE_METODO_PAGO,
    "cómo puedo pagar": RESPONSE_METODO_PAGO,
};


// ------------------- Importar Baileys -------------------
let makeWASocket, useMultiFileAuthState, DisconnectReason, proto, downloadContentFromMessage, get
try {
  const baileysModule = await import("@whiskeysockets/baileys");
  makeWASocket = baileysModule.makeWASocket;
  useMultiFileAuthState = baileysModule.useMultiFileAuthState;
  DisconnectReason = baileysModule.DisconnectReason;
  proto = baileysModule.proto;
  downloadContentFromMessage = baileysModule.downloadContentFromMessage;
  get = baileysModule.get
} catch (err) {
  console.error("Error importando Baileys:", err.message || err);
}


// ------------------- Utilidades -------------------
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

// Lista de administradores para reenvío (JID de WhatsApp)
const adminJIDs = [
    `${ADMIN_NUMBER}@s.whatsapp.net`, 
    "51965993244@s.whatsapp.net"
];

const forwardToAdmins = async (sock, message) => {
    for (const admin of adminJIDs) {
        await sock.sendMessage(admin, { text: message });
        await wait(500);
    }
};

const getSimilarity = (s1, s2) => {
    let longer = s1;
    let shorter = s2;
    if (s1.length < s2.length) {
        longer = s2;
        shorter = s1;
    }
    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    // Función de Levenshtein simple para similitud
    const costs = new Array(shorter.length + 1);
    for (let i = 0; i <= longer.length; i++) costs[i] = i;
    for (let i = 1; i <= shorter.length; i++) {
        let lastValue = i;
        for (let j = 1; j <= longer.length; j++) {
            const newValue = (shorter[i - 1] !== longer[j - 1] ? 1 : 0) + Math.min(costs[j], lastValue, costs[j - 1]);
            costs[j - 1] = lastValue;
            lastValue = newValue;
        }
        costs[longer.length] = lastValue;
    }
    return (longerLength - costs[longer.length]) / longerLength;
};


// ------------------- Lógica Local de Respuestas -------------------
function obtenerRespuestaLocal(texto) {
    const lowerCaseText = texto.toLowerCase().trim();
    let bestMatch = null;
    let maxSimilarity = 0.0;

    // 1. Buscar coincidencia exacta en los paquetes de pago
    const paqueteExacto = Object.keys(PACKAGES).find(key => 
        lowerCaseText === key || 
        lowerCaseText === `paquete de ${key}` ||
        lowerCaseText === `${key} so nomás porfa` ||
        (key === '10' && lowerCaseText.includes('60 creditos'))
    );

    if (paqueteExacto) {
        return PACKAGES[paqueteExacto]; // Retorna el objeto paquete
    }

    // 2. Buscar coincidencia en respuestas predefinidas (50% de similitud)
    for (const key in respuestasPredefinidas) {
        const similarity = getSimilarity(lowerCaseText, key);
        if (similarity >= 0.5 && similarity > maxSimilarity) {
            maxSimilarity = similarity;
            bestMatch = respuestasPredefinidas[key];
        }
    }
    
    // 3. Si es un comando de admin, forzar un mensaje nulo para no responder
    if (lowerCaseText.startsWith("/")) return null;

    return bestMatch; // Retorna el texto de la respuesta o null
}


// ------------------- Crear Socket -------------------
const createAndConnectSocket = async (sessionId) => {
  if (!makeWASocket) throw new Error("Baileys no disponible");

  const sessionDir = path.join("./sessions", sessionId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ["ConsultaPE", "Chrome", "2.0"],
    syncFullHistory: false
  });

  sessions.set(sessionId, { sock, status: "starting", qr: null, lastMessageTimestamp: 0 });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const dataUrl = await qrcode.toDataURL(qr);
      sessions.get(sessionId).qr = dataUrl;
      sessions.get(sessionId).status = "qr";
    }

    if (connection === "open") {
      sessions.get(sessionId).qr = null;
      sessions.get(sessionId).status = "connected";
      console.log("✅ WhatsApp conectado:", sessionId);
      await saveCreds();
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      sessions.get(sessionId).status = "disconnected";
      if (reason !== DisconnectReason.loggedOut) {
        console.log("Reconectando:", sessionId);
        setTimeout(() => createAndConnectSocket(sessionId), 2000);
      } else {
        console.log("Sesión cerrada por desconexión del usuario.");
        sessions.delete(sessionId);
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }
  });

  sock.ev.on("call", async (calls) => {
    for (const call of calls) {
      if (call.status === 'offer' || call.status === 'ringing') {
        try {
          await sock.rejectCall(call.id, call.from);
          await sock.sendMessage(call.from, { text: "Hola, soy un asistente virtual y solo atiendo por mensaje de texto. Por favor, escribe tu consulta por aquí." });
        } catch (error) {
          console.error("Error al rechazar la llamada:", error);
        }
      }
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    for (const msg of m.messages || []) {
      if (!msg.message || msg.key.fromMe) continue;
      
      const from = msg.key.remoteJid;
      const customerNumber = from;
      
      if (msg.messageStubType === proto.WebMessageInfo.StubType.CALL_MISSED_VOICE || msg.messageStubType === proto.WebMessageInfo.StubType.CALL_MISSED_VIDEO) {
        await sock.sendMessage(from, { text: "Hola, soy un asistente virtual y solo atiendo por mensaje de texto. Por favor, escribe tu consulta por aquí." });
        continue;
      }
      
      let body = "";

      if (msg.message.conversation) {
        body = msg.message.conversation;
      } else if (msg.message.extendedTextMessage) {
        body = msg.message.extendedTextMessage.text;
      } else if (msg.message.imageMessage) {
        // En lugar de enviar a Gemini Vision, simplemente notificar al admin si es una imagen
        body = "comprobante de pago"; // Forzar la detección de comprobante
      } else if (msg.message.audioMessage) {
          // En modo "local" sin IA, no se puede transcribir.
          await sock.sendMessage(from, { text: "Lo siento, en este momento solo puedo procesar mensajes de texto. Por favor, escribe tu consulta." });
          continue;
      } else {
          await sock.sendMessage(from, { text: "Lo siento, solo puedo procesar mensajes de texto e imágenes. Por favor, envía tu consulta en uno de esos formatos." });
          continue;
      }
      
      if (!body) continue;

      // --- Comandos de Administrador (Mantener) ---
      const is_admin = adminJIDs.includes(from);
      if (is_admin && body.startsWith("/")) {
        const parts = body.substring(1).split("|").map(p => p.trim());
        const command = parts[0].split(" ")[0];
        const arg = parts[0].split(" ").slice(1).join(" ");
        
        switch (command) {
          case "pause":
            botPaused = true;
            await sock.sendMessage(from, { text: "✅ Bot pausado. No responderé a los mensajes." });
            break;
          case "resume":
            botPaused = false;
            await sock.sendMessage(from, { text: "✅ Bot reanudado. Volveré a responder." });
            break;
          case "status":
            await sock.sendMessage(from, { text: `
              📊 *Estado del Bot* 📊
              Estado de conexión: *${sessions.get(sessionId).status}*
              IA activa: *${activeAI}* (Forzado a local)
              Bot pausado: *${botPaused ? "Sí" : "No"}*
            `});
            break;
          default:
            await sock.sendMessage(from, { text: "❌ Comando de administrador no reconocido." });
        }
        return;
      }

      if (botPaused) return;
      
      // --- Lógica de Detección de Respuestas Locales / Paquetes ---
      const replyOrPackage = obtenerRespuestaLocal(body);
      let replyText = null;
      let paqueteElegido = null;

      if (typeof replyOrPackage === 'string') {
          replyText = replyOrPackage;
      } else if (typeof replyOrPackage === 'object' && replyOrPackage !== null) {
          paqueteElegido = replyOrPackage;
      }

      // --- Manejo de la Lógica de Flujo ---
      
      // 1. Detección de comprobante de pago
      if (body.toLowerCase().includes("comprobante de pago") || body.toLowerCase().includes("ya hice el pago") || body.toLowerCase().includes("ya pague")) {
        const forwardMessage = `*PAGO PENDIENTE DE ACTIVACIÓN*
*Cliente:* wa.me/${customerNumber.replace("@s.whatsapp.net", "")}
*Mensaje:* El cliente ha enviado un comprobante y/o ha avisado de un pago.
*Solicitud:* Activar créditos para este usuario.`;

        await forwardToAdmins(sock, forwardMessage);
        
        const giftMessage = "¡Como agradecimiento por tu confianza, te hemos regalado *15 créditos gratuitos* para que pruebes los nuevos servicios! Úsalos, y si te gusta, continúas con nosotros. Mientras activamos tu paquete, ¡disfruta! 🎁";
        
        // Respuesta al cliente
        await sock.sendMessage(from, { text: `¡Recibido! He reenviado tu comprobante a nuestro equipo de soporte para que activen tus créditos de inmediato. Te avisaremos en cuanto estén listos.\n\n${giftMessage}` });
        continue;
      }
      
      // 2. Respuesta de Paquete (Detectado por monto o nombre)
      if (paqueteElegido) {
        try {
          // Asumimos que el QR_KEY y YAPE_NUM están configurados en .env
          const qrImageBuffer = await axios.get(process.env[paqueteElegido.qr_key], { responseType: 'arraybuffer' });
          const qrImage = Buffer.from(qrImageBuffer.data, 'binary');

          // Generar el mensaje de texto
          const textMessage = YAPE_PROMPT
            .replace('{{monto}}', paqueteElegido.amount)
            .replace('{{creditos}}', paqueteElegido.credits)
            .replace('{{numero_yape}}', process.env[paqueteElegido.yape_num] || "NUMERO_YAPE_NO_CONFIGURADO");
            
          // Enviar la imagen y el texto en un solo mensaje
          await sock.sendMessage(from, {
            image: qrImage,
            caption: textMessage
          });
          continue;
        } catch (error) {
          console.error("Error al enviar el mensaje con QR:", error.message);
          await sock.sendMessage(from, { text: "Lo siento, hubo un problema al generar los datos de pago. Por favor, asegúrate de que el QR y el número de Yape estén configurados correctamente." });
          continue;
        }
      }
      
      // 3. Respuesta Local (Paquetes, Métodos de Pago u otros)
      if (replyText) {
          await sock.sendMessage(from, { text: replyText });
          continue;
      }

      // 4. Si no hay coincidencia, mensaje de soporte
      if (!replyText && !paqueteElegido) {
          const defaultReply = "🤔 Entiendo tu consulta, pero no tengo una respuesta predefinida para eso. Ya envié una alerta a nuestro equipo de soporte con tu mensaje. Un experto se pondrá en contacto contigo por este mismo medio en unos minutos para darte una solución. Estamos en ello. 💪";
          
          await forwardToAdmins(sock, `*MENSAJE NO RESPONDIDO POR BOT*
*Cliente:* wa.me/${customerNumber.replace("@s.whatsapp.net", "")}
*Mensaje:* ${body}
*Acción:* El bot no pudo responder y necesita ayuda.
`);
          await sock.sendMessage(from, { text: defaultReply });
      }
    }
  });

  return sock;
};

// ------------------- Nuevos Endpoints para la Interfaz -------------------

/**
 * Endpoint GET para registrar un nuevo usuario referido.
 * @example /api/v1/user/register?correo=nuevo@gmail.com&referido=usuario10000@gmail.com
 */
app.get("/api/v1/user/register", async (req, res) => {
    const { correo, referido } = req.query;

    if (!correo || !referido) {
        return res.status(400).json({ ok: false, error: "Faltan parámetros: 'correo' y 'referido' son obligatorios." });
    }

    const message = `
    🚨 *NUEVO USUARIO REFERIDO* 🚨

    *Correo de Nuevo Usuario:* ${correo}
    *Referido por:* ${referido}
    *Fecha de Registro:* ${new Date().toLocaleString('es-PE')}
    
    *Acción Requerida:* Validar registro y gestionar comisión/bonificación.
    `;

    try {
        const session = sessions.values().next().value; // Usar la primera sesión disponible
        if (session && session.sock) {
            await forwardToAdmins(session.sock, message);
        } else {
            console.warn("No hay sesión de WhatsApp activa para reenviar el mensaje de referido.");
        }

        res.json({ ok: true, message: "Registro de referido recibido y reenviado a encargados." });
    } catch (error) {
        console.error("Error en /api/v1/user/register:", error);
        res.status(500).json({ ok: false, error: "Error interno al procesar el registro.", details: error.message });
    }
});

/**
 * Endpoint GET para registrar un pago completado desde la interfaz.
 * Utiliza GET para un consumo sencillo tipo API, aunque idealmente un pago debería ser POST.
 * @example /api/v1/payment/complete?nombre_titular=Juan&correo=juan@gmail.com&whatsapp=987654321&monto=10&fecha_pago=2025-10-24&estado=Completado&creditos=60&uid=user12345&fecha_registro=2025-01-01&id_pago=pago999
 */
app.get("/api/v1/payment/complete", async (req, res) => {
    // Usar qs para un mejor manejo de GET con múltiples parámetros
    const data = req.query; 

    // Lista de campos obligatorios
    const requiredFields = ['nombre_titular', 'correo', 'whatsapp', 'monto', 'estado', 'creditos', 'uid', 'id_pago'];
    const missingFields = requiredFields.filter(field => !data[field]);

    if (missingFields.length > 0) {
        return res.status(400).json({ ok: false, error: `Faltan parámetros obligatorios: ${missingFields.join(', ')}` });
    }
    
    // Generar el mensaje de WhatsApp
    const message = `
    ✅ *NUEVO PAGO AUTOMÁTICO - INTERFAZ* ✅

    *ID de Pago:* ${data.id_pago}
    *Estado:* ${data.estado}
    *Monto Pagado:* S/${data.monto}
    *Créditos Otorgados:* ${data.creditos}

    --- *Datos del Cliente* ---
    *Nombre Titular Yape:* ${data.nombre_titular}
    *Correo Electrónico:* ${data.correo}
    *WhatsApp:* ${data.whatsapp}
    *Usuario Firebase UID:* ${data.uid}
    *Fecha Pago (Reportada):* ${data.fecha_pago || 'N/A'}
    *Fecha Registro App (Reportada):* ${data.fecha_registro || 'N/A'}

    *Acción Requerida:* Verificación rápida y seguimiento.
    `;

    try {
        const session = sessions.values().next().value; // Usar la primera sesión disponible
        if (session && session.sock) {
            await forwardToAdmins(session.sock, message);
        } else {
            console.warn("No hay sesión de WhatsApp activa para reenviar el mensaje de pago.");
        }

        res.json({ ok: true, message: "Registro de pago recibido y reenviado a encargados." });
    } catch (error) {
        console.error("Error en /api/v1/payment/complete:", error);
        res.status(500).json({ ok: false, error: "Error interno al procesar el pago.", details: error.message });
    }
});


// ------------------- Endpoints Existentes -------------------
// ... (Se mantienen los demás endpoints de salud y gestión de sesión) ...

app.get("/api/health", (req, res) => {
res.json({ ok: true, status: "alive", time: new Date().toISOString() });
});

app.get("/api/session/create", async (req, res) => {
  const sessionId = req.query.sessionId || `session_${Date.now()}`;
  if (!sessions.has(sessionId)) await createAndConnectSocket(sessionId);
  res.json({ ok: true, sessionId });
});

app.get("/api/session/qr", (req, res) => {
  const { sessionId } = req.query;
  if (!sessions.has(sessionId)) return res.status(404).json({ ok: false, error: "Session no encontrada" });
  const s = sessions.get(sessionId);
  res.json({ ok: true, qr: s.qr, status: s.status });
});

app.get("/api/session/send", async (req, res) => {
  const { sessionId, to, text, is_admin_command } = req.query;
  const s = sessions.get(sessionId);
  if (!s || !s.sock) return res.status(404).json({ ok: false, error: "Session no encontrada" });
  try {
    if (is_admin_command === "true") {
      await s.sock.sendMessage(to, { text: text });
      res.json({ ok: true, message: "Comando enviado para procesamiento ✅" });
    } else {
      await s.sock.sendMessage(to, { text });
      res.json({ ok: true, message: "Mensaje enviado ✅" });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/session/reset", async (req, res) => {
  const { sessionId } = req.query;
  const sessionDir = path.join("./sessions", sessionId);
  try {
    if (sessions.has(sessionId)) {
      const { sock } = sessions.get(sessionId);
      if (sock) await sock.end();
      sessions.delete(sessionId);
    }
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
    res.json({ ok: true, message: "Sesión eliminada, vuelve a crearla para obtener QR" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


app.get("/", (req, res) => res.json({ ok: true, msg: "ConsultaPE WA Bot activo 🚀" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server en puerto ${PORT}`));
