import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import qrcode from "qrcode";
import fs from "fs";
import path from "path";
// Importar solo WAMessageStubType del paquete principal de Baileys
// El resto se carga dinámicamente para evitar problemas de compatibilidad al iniciar
import { WAMessageStubType } from "@whiskeysockets/baileys"; 

// --- CONFIGURACIÓN INICIAL ---
dotenv.config();

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// --- MODULARIDAD: Almacenamiento Global para Clientes (¡CRUCIAL!) ---
const sessions = new Map();
const userStates = new Map(); 
const businessConfigs = new Map();

// --- CONFIGURACIÓN POR DEFECTO DEL NEGOCIO (SIMULANDO DB) ---
const DEFAULT_CLIENT_ID = "CLIENTE_CONSULTA_PE_001"; 

// Estructura de un Módulo de Negocio (Business Module)
class BusinessModule {
    constructor(id, keywords, responseType, responseContent, mediaUrl = null, aiPrompt = null) {
        this.id = id; 
        this.keywords = Array.isArray(keywords) ? keywords.map(k => k.toLowerCase().trim()) : [];
        this.responseType = responseType; 
        this.responseContent = responseContent; 
        this.mediaUrl = mediaUrl; 
        this.aiPrompt = aiPrompt; 
    }
}

// Inicialización de la configuración del cliente (simulando una carga desde la DB)
const initialConfig = {
    client_id: DEFAULT_CLIENT_ID,
    activeAI: process.env.DEFAULT_AI || "gemini",
    openai_vision_enabled: true,
    openai_image_gen_enabled: true,
    botPaused: false,
    welcomeMessage: "¡Hola! ¿Cómo puedo ayudarte hoy? Soy tu asistente virtual de negocios, listo para resolver tus dudas.",
    adminNumber: process.env.ADMIN_NUMBER,
    webhookUrl: process.env.BUSINESS_WEBHOOK_URL || 'http://your-admin-panel.com/webhook/incoming',
    GEMINI_CORE_PROMPT: `
        Eres un asistente de negocios profesional, carismático y experto.
        Tu rol es responder a las consultas del usuario basándote en la información que tienes.
        Usa un lenguaje formal pero cercano. Evita las disculpas. Ve directo a la solución.
        Si la pregunta es fuera de contexto o no tienes la respuesta, redirige al menú principal o a un asesor.
        ---
        Historial de conversación:
    `,
    OPENAI_CORE_PROMPT: "",
    COHERE_CORE_PROMPT: "",
    modules: [
        new BusinessModule(
            "MOD_COMPRA_CREDITOS",
            ["comprar creditos", "necesito creditos", "quiero el acceso"],
            "TEXT",
            `Bienvenido a la sección Premium. 🚀 Elige tu paquete:
            1. S/10 (60 Créditos)
            2. S/50 (330 Créditos)
            3. S/100 (700 Créditos)
            Responde con el monto que deseas pagar (ej: "Pagar 50") para recibir el QR de pago.`,
        ),
        new BusinessModule(
            "MOD_PAGO_YAPE",
            ["pagar 10", "pagar 50", "pagar 100"],
            "QR_PAYMENT", 
            `¡Pago en proceso! Escanea el QR para S/{{monto}} ({{creditos}} Créditos).
            Titular: José R. Cubas.
            *Una vez pagado, envía el comprobante y tu correo registrado.*`,
            "https://i.imgur.com/your-qr-image.png"
        ),
        new BusinessModule(
            "MOD_COMPROBANTE_RECIBIDO",
            ["comprobante", "ya hice el pago", "pague pero no me llega"],
            "MANUAL_FORWARD", 
            `¡Comprobante recibido! Lo he enviado a nuestro equipo para la activación inmediata de tus créditos. Te avisaremos en cuanto esté listo. ⏳`,
        ),
        new BusinessModule(
            "MOD_DESCARGA_APP",
            ["donde la descargo", "link de descarga", "apk"],
            "TEXT",
            `Aquí tienes los enlaces seguros:
            🔗 App Store: [Link 1]
            🔗 Google Play: [Link 2]
            ¡A descargar y a dominar la data!`,
        ),
        new BusinessModule(
            "MOD_SIN_RESPUESTA_IA",
            ["no me funciona", "error en el sistema", "no pude"],
            "MANUAL_FORWARD", 
            `Ya envié una alerta a nuestro equipo de soporte. Un experto se pondrá en contacto contigo en unos minutos para darte una solución. Estamos en ello.`,
        ),
        new BusinessModule(
            "MOD_AGRADECIMIENTO",
            ["gracias", "me es util", "la app es genial"],
            "TEXT",
            `¡Nos encanta que te encante! Si quieres compartir el poder, aquí está el link: [Link]. Gracias por ser parte de los que sí resuelven.`,
        ),
    ],
    paymentData: {
        YAPE_NUMBER: "929008609",
        TITULAR: "José R. Cubas",
        PACKAGES: {
            '10': { amount: 10, credits: 60, qr_url_id: "MOD_PAGO_YAPE" },
            '50': { amount: 50, credits: 330, qr_url_id: "MOD_PAGO_YAPE" },
            '100': { amount: 100, credits: 700, qr_url_id: "MOD_PAGO_YAPE" },
        }
    }
};

businessConfigs.set(DEFAULT_CLIENT_ID, initialConfig);

// --- UTILIDADES ---
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const getClientConfig = (clientId) => businessConfigs.get(clientId) || initialConfig;

const forwardToAdmins = async (sock, message, customerNumber, config) => {
    const adminNumbers = config.adminNumber.split(',').map(n => `${n.trim()}@s.whatsapp.net`);
    const forwardedMessage = `*🚨 REENVÍO DE SOPORTE - ${config.client_id}*
    
*Cliente:* wa.me/${customerNumber.replace("@s.whatsapp.net", "")}

*Mensaje del cliente:*
${message}
    
*Atención inmediata requerida.*`;

    for (const admin of adminNumbers) {
        await sock.sendMessage(admin, { text: forwardedMessage });
    }
};

// ------------------- Importar Baileys (Asegurar la carga) -------------------
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
  console.error("Error importando Baileys. Asegúrate de tener la dependencia instalada:", err.message || err);
}

// ------------------- LÓGICA DE I.A. -------------------

// 1. GEMINI: Lógica de texto y Prompts Modulares
const consumirGemini = async (prompt, clientId) => {
    const config = getClientConfig(clientId);
    try {
        if (!process.env.GEMINI_API_KEY) return "Error: API Key de Gemini no configurada.";
        
        const model = "gemini-2.5-flash"; 
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        const fullPrompt = `${config.GEMINI_CORE_PROMPT}\nUsuario: ${prompt}`;
        
        const body = {
            contents: [{ parts: [{ text: fullPrompt }] }],
            config: { temperature: 0.7 }
        };
        
        const response = await axios.post(url, body, { timeout: 20000 });
        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        return text ? text.trim() : null;
    } catch (err) {
        console.error("Error al consumir Gemini API:", err.response?.data || err.message);
        return "Lo siento, la IA de texto está temporalmente inactiva. He notificado a soporte.";
    }
};

// 2. OPENAI: Visión (Comprobantes) y Generación de Imágenes (MOCKS)
const sendToOpenAIVision = async (imageBuffer, clientId) => {
    const config = getClientConfig(clientId);
    if (!config.openai_vision_enabled || !process.env.OPENAI_API_KEY) {
        return "El análisis de imágenes está desactivado. He reenviado el mensaje a soporte.";
    }
    // MOCK
    return "Comprobante de pago"; 
};

const generateOpenAIImage = async (prompt) => {
    // MOCK
    return "https://i.imgur.com/dalle-generated-image.jpg";
};


// ------------------- LÓGICA MODULAR DE NEGOCIO -------------------

function findBusinessModule(text, config) {
    const lowerCaseText = text.toLowerCase().trim();
    
    for (const module of config.modules) {
        if (module.keywords.some(keyword => lowerCaseText.includes(keyword))) {
            if (module.id === "MOD_PAGO_YAPE") {
                const parts = lowerCaseText.split(' ');
                const amount = parts.find(p => !isNaN(parseInt(p)));
                if (amount && config.paymentData.PACKAGES[amount]) {
                    return { module, amount: parseInt(amount) };
                }
            }
            return { module };
        }
    }
    return null;
}

// ------------------- FUNCIONALIDAD DE PLATAFORMA (CRUD) -------------------

app.post("/api/admin/config/save/:clientId", (req, res) => {
    const { clientId } = req.params;
    const newConfig = req.body;
    
    if (newConfig.client_id !== clientId) {
        return res.status(400).json({ ok: false, error: "El client_id en la URL y el cuerpo no coinciden." });
    }
    
    if (newConfig.modules && Array.isArray(newConfig.modules)) {
        newConfig.modules = newConfig.modules.map(mod => new BusinessModule(
            mod.id, mod.keywords, mod.responseType, mod.responseContent, mod.mediaUrl, mod.aiPrompt
        ));
    }
    
    businessConfigs.set(clientId, { ...getClientConfig(clientId), ...newConfig });
    res.json({ ok: true, message: `Configuración para ${clientId} guardada con éxito.`, config: businessConfigs.get(clientId) });
});

app.get("/api/admin/config/get/:clientId", (req, res) => {
    const { clientId } = req.params;
    const config = getClientConfig(clientId);
    if (!config) return res.status(404).json({ ok: false, error: "Cliente no encontrado." });
    res.json({ ok: true, config });
});

app.post("/api/admin/sendbulk/:clientId", async (req, res) => {
    const { sessionId } = req.query;
    const { numbers, message, mediaUrl, mediaType } = req.body;
    const s = sessions.get(sessionId);
    const config = getClientConfig(req.params.clientId);

    if (!s || !s.sock || s.status !== "connected") {
        return res.status(404).json({ ok: false, error: "Sesión de WhatsApp no conectada." });
    }
    if (!numbers || !message) {
        return res.status(400).json({ ok: false, error: "Números y mensaje son requeridos." });
    }

    const numberList = numbers.split(",").map(num => `${num.trim()}@s.whatsapp.net`);
    let sentCount = 0;
    
    for (const number of numberList) {
        const manualMessageText = `${message}\n\n###BUSINESS_REPLY_ID###\n${config.client_id}`;
        
        try {
            if (mediaUrl && mediaType) {
                const response = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(response.data);
                const mediaMsg = { [mediaType]: buffer, caption: manualMessageText };
                await s.sock.sendMessage(number, mediaMsg);
            } else {
                await s.sock.sendMessage(number, { text: manualMessageText });
            }
            sentCount++;
            await wait(1500);
        } catch (error) {
            console.error(`Error al enviar a ${number}:`, error.message);
        }
    }
    res.json({ ok: true, message: `✅ Mensaje enviado a ${sentCount} de ${numberList.length} contactos.` });
});


// ------------------- CORE DEL WHATSAPP BOT -------------------

const createAndConnectSocket = async (sessionId, clientId) => {
    const config = getClientConfig(clientId);
    if (!makeWASocket) throw new Error("Baileys no disponible");

    const sessionDir = path.join("./sessions", sessionId);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: [`${clientId}-Bot`, "Chrome", "2.0"],
        syncFullHistory: false
    });

    sessions.set(sessionId, { sock, status: "starting", qr: null, lastMessageTimestamp: 0, clientId });

    sock.ev.on("creds.update", saveCreds);
    
    // --- Manejo de Conexión, QR y Desconexión ---
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
            // Lógica de reconexión. Esto es crucial.
            if (reason !== DisconnectReason.loggedOut) {
                console.log("Reconectando:", sessionId);
                // Usamos un pequeño delay para evitar el loop infinito si el error es persistente
                setTimeout(() => createAndConnectSocket(sessionId, clientId), 5000); 
            } else {
                console.log("Sesión cerrada por desconexión del usuario (Logged Out).");
                sessions.delete(sessionId);
                // No borramos la carpeta de sesión aquí para evitar errores de FS si el proceso está inestable.
                // La eliminación debe hacerse solo a través del endpoint de reset.
                // fs.rmSync(sessionDir, { recursive: true, force: true });
            }
        }
    });

    sock.ev.on("messages.upsert", async (m) => {
        const currentSession = sessions.get(sessionId);
        if (!currentSession) return;
        const config = getClientConfig(currentSession.clientId);

        for (const msg of m.messages || []) {
            if (!msg.message || msg.key.fromMe) continue;
            
            const from = msg.key.remoteJid;
            const customerNumber = from;
            
            if (msg.messageStubType === WAMessageStubType.CALL_MISSED_VOICE || msg.messageStubType === WAMessageStubType.CALL_MISSED_VIDEO) {
                await sock.sendMessage(from, { text: "Hola, soy un asistente virtual y solo atiendo por mensaje de texto." });
                continue;
            }
            
            let body = "";
            let mediaType = null;
            let mediaUrl = null;

            // --- LÓGICA DE RESPUESTA A MENSAJE MANUAL (VÍNCULO 24/7) ---
            const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMessage) {
                const originalMessageText = quotedMessage?.conversation || quotedMessage?.extendedTextMessage?.text;
                if (originalMessageText && originalMessageText.includes("###BUSINESS_REPLY_ID###")) {
                    
                    const replyId = originalMessageText.split("###BUSINESS_REPLY_ID###\n")[1]?.trim();
                    if (replyId !== config.client_id) {
                        console.log(`Respuesta manual ignorada: ID de cliente incorrecto: ${replyId}`);
                        continue; 
                    }
                    
                    let content = null;
                    if (msg.message.conversation) content = msg.message.conversation;
                    else if (msg.message.extendedTextMessage) content = msg.message.extendedTextMessage.text;
                    else if (msg.message.imageMessage) {
                        mediaType = "image";
                        mediaUrl = "http://your-server.com/uploaded-image.png"; 
                        content = `Respuesta con Imagen: ${msg.message.imageMessage.caption || 'sin pie'}`;
                    } else if (msg.message.documentMessage) {
                        mediaType = "document";
                        mediaUrl = "http://your-server.com/uploaded-pdf.pdf";
                        content = `Respuesta con Archivo: ${msg.message.documentMessage.fileName || 'sin nombre'}`;
                    }
                    
                    const payload = {
                        clientId: config.client_id,
                        customerNumber: from.replace("@s.whatsapp.net", ""),
                        messageContent: content,
                        mediaUrl: mediaUrl,
                        mediaType: mediaType,
                        timestamp: Date.now(),
                        originalQuotedMessage: originalMessageText.split("\n\n###BUSINESS_REPLY_ID###")[0] 
                    };
                    
                    try {
                        await axios.post(config.webhookUrl, payload);
                        await sock.sendMessage(from, { text: "¡Recibido! Tu respuesta ha sido procesada y se ha notificado a soporte." });
                    } catch (error) {
                        console.error("Error al enviar el payload a la interfaz:", error.message);
                        await sock.sendMessage(from, { text: "Error: No pudimos notificar al panel. Reenvía tu mensaje a un administrador." });
                    }
                    
                    continue; 
                }
            }
            // --- FIN LÓGICA DE RESPUESTA MANUAL ---

            // Obtener el cuerpo del mensaje para IA/Módulos
            if (msg.message.conversation) body = msg.message.conversation;
            else if (msg.message.extendedTextMessage) body = msg.message.extendedTextMessage.text;
            else if (msg.message.imageMessage) {
                const imageBuffer = await downloadContentFromMessage(msg.message.imageMessage, 'image');
                let bufferArray = [];
                for await (const chunk of imageBuffer) bufferArray.push(chunk);
                const buffer = Buffer.concat(bufferArray);
                body = await sendToOpenAIVision(buffer, config.client_id); 
            } else if (msg.message.audioMessage) {
                body = "Audio transcrito: 'Quiero comprar créditos'"; 
            } else {
                await sock.sendMessage(from, { text: "Solo puedo procesar texto, imágenes y audios." });
                continue;
            }
            
            if (!body) continue;
            if (config.botPaused) return;

            // --- LÓGICA DE MÓDULOS DE NEGOCIO Y CORE IA ---
            const matchedModuleData = findBusinessModule(body, config);
            let reply = null;

            if (matchedModuleData) {
                const { module, amount } = matchedModuleData;
                
                switch (module.responseType) {
                    case "QR_PAYMENT":
                        const packageData = config.paymentData.PACKAGES[amount];
                        if (!packageData) { reply = "No encontré un paquete con ese monto."; break; }
                        const qrModule = config.modules.find(m => m.id === packageData.qr_url_id);
                        if (!qrModule || !qrModule.mediaUrl) { reply = "Error: Módulo de QR mal configurado."; break; }

                        try {
                            const qrImageBuffer = await axios.get(qrModule.mediaUrl, { responseType: 'arraybuffer' });
                            const qrImage = Buffer.from(qrImageBuffer.data, 'binary');
                            const textMessage = module.responseContent.replace('{{monto}}', amount).replace('{{creditos}}', packageData.credits);
                            await sock.sendMessage(from, { image: qrImage, caption: textMessage });
                            continue;
                        } catch (error) {
                            console.error("Error al enviar QR:", error.message);
                            reply = "Hubo un error al generar el QR de pago.";
                        }
                        break;

                    case "MANUAL_FORWARD":
                        await forwardToAdmins(sock, body, customerNumber, config);
                        reply = module.responseContent;
                        break;
                        
                    case "TEXT":
                        reply = module.responseContent;
                        break;
                        
                    case "IMAGE_GENERATION":
                         if (config.openai_image_gen_enabled) {
                             const imageUrl = await generateOpenAIImage(module.aiPrompt || body);
                             await sock.sendMessage(from, { image: { url: imageUrl }, caption: module.responseContent });
                             continue;
                         }
                         reply = "La generación de imágenes está desactivada.";
                         break;
                    default:
                        reply = "Módulo de respuesta no reconocido. Contacta a soporte.";
                }
            }
            
            // Core de IA (Gemini) si no hay respuesta modular
            if (!reply) {
                await sock.sendPresenceUpdate("composing", from);
                reply = await consumirGemini(body, config.client_id);
            }
            
            // Respuesta de soporte si la IA falla
            if (!reply || reply.includes("temporalmente inactiva")) {
                const supportModule = config.modules.find(m => m.id === "MOD_SIN_RESPUESTA_IA");
                if (supportModule) {
                     await forwardToAdmins(sock, body, customerNumber, config);
                     reply = supportModule.responseContent;
                } else {
                     reply = "Lo siento, hubo un fallo en el sistema. Soporte ha sido notificado.";
                }
            }

            await sock.sendPresenceUpdate("paused", from);
            if (reply) await sock.sendMessage(from, { text: reply });
        }
    });

    return sock;
};


// ------------------- ENDPOINTS DE PLATAFORMA (SIMPLIFICADOS) -------------------

app.get("/api/health", (req, res) => {
    res.json({ ok: true, status: "alive", time: new Date().toISOString() });
});

app.get("/api/session/create", async (req, res) => {
  const sessionId = req.query.sessionId || `session_${Date.now()}`;
  const clientId = req.query.clientId || DEFAULT_CLIENT_ID; 
  if (!sessions.has(sessionId)) await createAndConnectSocket(sessionId, clientId);
  res.json({ ok: true, sessionId, clientId });
});

app.get("/api/session/qr", (req, res) => {
  const { sessionId } = req.query;
  if (!sessions.has(sessionId)) return res.status(404).json({ ok: false, error: "Session no encontrada" });
  const s = sessions.get(sessionId);
  res.json({ ok: true, qr: s.qr, status: s.status, clientId: s.clientId });
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
        // Eliminación física del archivo de la sesión
        if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
        res.json({ ok: true, message: "Sesión eliminada. Vuelve a crearla para obtener QR." });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get("/", (req, res) => res.json({ ok: true, msg: "Asistente Empresarial Modular activo 🚀" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server en puerto ${PORT}`));
