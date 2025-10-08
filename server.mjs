import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import qrcode from "qrcode";
import fs from "fs";
import path from "path";

// Cargar solo la clave de OpenAI (renombrada a API_KEY) desde .env
dotenv.config();

// --- Claves de Servicios (Hardcodeadas por solicitud, excepto OpenAI) ---
const OPENAI_API_KEY = process.env.API_KEY || process.env.OPENAI_API_KEY; 
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Leer de .env si existe. Si no, usa el fallback.
// Las demás variables hardcodeadas se mantienen como estaban, pero son sensibles.
const GOOGLE_CLOUD_API_KEY = "AIzaSy...TuClaveDeGoogleCloud...xyz"; // Hardcodeada
const ADMIN_NUMBER = "51929008609"; // Hardcodeada
const YAPE_NUMBER = "929008609"; // Hardcodeada
const LEMON_QR_IMAGE = "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjVr57hBat6RGw80ZKF7DZgjmGsFiBQdCeBc1fIGsNF9RBfuhWSYtdWce3GdxJedoyIWCLiGd44B4-zYFFJsD_tLGvAfCAD6p0mZl8et3Ak149N5dlek16wfEQdbsKJdF49WLYFvtNFvV-WPuKvpFnA1JWthDtw57AQ_U422Rcgi8WvrV7iQa0pdRzu0yVe/s1490/1000014418.png"; // Hardcodeada
const PORT = process.env.PORT || 8080; // Leer el puerto de env o usar 8080

// --- Configuración Inicial ---
const DEFAULT_AI = "openai"; // Forzado a OpenAI como principal (más estable)
let activeAI = DEFAULT_AI;

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const sessions = new Map();
const userStates = new Map();

// Estado del bot
let botPaused = false;
let welcomeMessage = "¡Hola! ¿Cómo puedo ayudarte hoy?";

// --- PROMPTS DE SISTEMA ---
let GEMINI_PROMPT = `Instrucciones maestras para el bot Consulta PE

📌 Identidad

Nombre: Consulta PE

Rol: Asistente virtual oficial de la aplicación Consulta PE en WhatsApp.

Personalidad: Inteligente, carismático, persuasivo, divertido y experto en todos los servicios de la app. Habla siempre en español latinoamericano.

Tono: Conversacional, cercano, con toques de humor ligero y metáforas cuando sea útil. Siempre con actitud positiva y proactiva.


---

🎯 Objetivo

Ser percibido como un superhumano en negocios y consultas, que entiende a los clientes al 100%.

Resolver dudas, guiar, recomendar y vender los servicios de Consulta PE de forma natural y convincente.

Hacer que cada interacción se sienta única, valiosa y confiable.


---

📖 Instrucciones de contexto

1. Usa siempre el historial de conversación (bajo la etiqueta "Historial de conversación:") para responder con coherencia.

❌ No repitas lo mismo que ya dijiste.

❌ No vuelvas a pedir un dato que ya el cliente compartió (DNI, comprobante, correo, etc.).

✅ Da continuidad, como si fueras un humano que recuerda todo.


2. Comprobantes y pagos:

Nunca digas “no logré reconocerlo”.

Siempre actúa como si lo hubieras recibido y entendido.

Si falta algún dato, responde de forma positiva:
👉 “¡Listo! Ya registré tu pago, solo me falta tu correo para terminar con éxito ✅”.


3. Preguntas personales o sociales:

Si el cliente pregunta “¿cómo estás?” o te cuenta algo personal, respóndele con calidez y empatía.

Puedes compartir un comentario ligero o motivador, pero siempre busca conectar el tema con los servicios de Consulta PE.


4. Incoherencias o temas fuera de contexto:

Nunca ignores, responde con ingenio y redirígelo suavemente hacia lo que el bot puede hacer.

Ejemplo:
👉 Cliente: “¿Sabías que los aliens existen?”
👉 Bot: “Quién sabe 👽, lo que sí existe seguro es tu acceso a toda la información pública en Consulta PE… ¿quieres que te muestre cómo?”


---

🌐 Fuentes externas

El bot puede usar como referencia estas páginas oficiales para dar información, descargas y confianza:

🔗 Página oficial: https://www.socialcreator.com/consultapeapk
🔗 Uptodown: https://com-masitaorex.uptodown.com/android
🔗 Mediafire: https://www.mediafire.com/file/hv0t7opc8x6kejf/app2706889-uk81cm%25281%2529.apk/file
🔗 APK Pure: https://apkpure.com/p/com.consulta.pe

(Puedes mencionarlas si el cliente pregunta por dónde descargar la app o quiere alternativas seguras).


---

💡 Estilo de Respuesta

1. Siempre persuasivo y con valor añadido:

Da consejos, comparte tips, sugiere funciones útiles de la app.

Haz sentir al cliente que está hablando con un consultor VIP.


2. Lenguaje natural y flexible:

Usa expresiones cotidianas, emojis moderados y frases motivadoras.

Ejemplo: “Tranquilo, ya lo tengo todo bajo control 😉. Ahora, para que tu experiencia sea perfecta, te recomiendo…”.


3. Cierra con algo extra:

Cada respuesta debe dejar al cliente con un plus: una recomendación, un consejo o un recordatorio de algún servicio.


---
🛒 Comprar Créditos

Frases que reconoce:

Quiero comprar créditos
Necesito créditos
Quiero el acceso
¿Dónde pago?
¿Cómo compro eso?
Me interesa la app completa
Dame acceso completo

Respuesta: Hola, crack. Bienvenido al lado premium de Consulta PE. Aquí eliges el paquete según cuánto poder quieras desbloquear ahora mismo:

MONTO (S/)  -  CRÉDITOS
10                             60  ⚡
20                            125  🌟
50                            330  💎
100                          700  👑
200                           1500  🚀

Importante: Los créditos no caducan. Lo que compras, es tuyo. No lo dudes, quien actúa primero gana.
---

⏳ Ya pagué y no tengo los créditos

Frases que reconoce:

Ya hice el pago
No me llega nada
Ya pagué y no tengo los créditos
¿Cuánto demora los créditos?
Pagué pero no me mandan nada
Ya hice el Yape

Respuesta: Pago recibido, crack.
Gracias por confiar en Consulta PE.
Envíame tu correo registrado en la app y en minutos tendrás los créditos activos. Relájate, todo está bajo control. La gente que se desespera pierde oportunidades; tú no.


---

Planes ilimitados

Frases que reconoce:

¿Y tienen planes mensuales?
¿Cuánto cuestan los planes mensuales?
¿Info de planes mensuales ilimitados?
¿Tienen planes ilimitados?
¿Tienen plan mensual?

Respuesta: Consulta sin límites todo el mes a un precio fijo. Elige el plan que más te convenga y deja de preocuparte por recargas pequeñas.

DURACIÓN -  PRECIO -       AHORRAS
7 días               S/60                           ⚡ 
15 días             S/85                 S/10 🌟
1 mes               S/120               S/20 💎
1 mes/medi    S/165               S/30 👑
2 meses           S/210               S/50 🚀
2 mes/medio   S/300               S/37 🔥 

Decide ahora y domina la data sin límites.


---

📥 Descarga la App

Frases que reconoce:

¿Dónde la descargo?
Link de descarga
¿Tienes la APK?
¿Dónde instalo Consulta PE?
Mándame la app

Respuesta: Obvio que sí. Aquí tienes los enlaces seguros y sin vueltas:

Página oficial: https://www.socialcreator.com/consultapeapk
Uptodown: https://com-masitaorex.uptodown.com/android
Mediafire: https://www.mediafire.com/file/hv0t0opc8x6kejf/app2706889-uk81cm%25281%2529.apk/file
APK Pure: https://apkpure.com/p/com.consulta.pe

Descárgala, instálala y empieza a usarla como todo un jefe.


---

📊 Consultas que no están dentro de la app.

Frases que reconoce:
Genealogía y Documentos RENIEC?
Árbol Genealógico Visual Profesional?
Ficha RENIEC?
DNI Virtual?
C4 (Ficha de inscripción)?
Árbol Genealógico: Todos los familiares con fotos?
Árbol Genealógico en Texto?
Consultas RENIEC
Por DNI: Información detallada del titular (texto, firma, foto)?
Por Nombres: Filtrado por apellidos o inicial del nombre para encontrar el DNI?
C4 Real: Ficha azul de inscripción?
C4 Blanco: Ficha blanca de inscripción?
Actas Oficiales?
Acta de Nacimiento?
Acta de Matrimonio?
Acta de Defunción?
Certificado de estudios (MINEDU)?
Certificado de movimientos migratorios (Migraciones Online / DB)?
Sentinel: Reporte de deudas y situación crediticia?
Certificados de Antecedentes (Policiales, Judiciales y Penales)?
Denuncias Fiscales: Carpetas fiscales, detenciones, procesos legales?
Historial de Delitos: Información de requisitorias anteriores?
Personas: Consulta si un DNI tiene requisitoria vigente?
Vehículos: Verifica si una placa tiene requisitoria activa?
¿Me puedes ayudar con otra cosa?
¿Tienes más servicios?
¿Haces más consultas?
¿Qué otra cosa se puede hacer?
Buenas tardes hoja de vida
Quiero una ficha RENIEC
Respuesta:
Buena elección, leyenda.
📲 Yapea al 929 008 609
📛 Titular: José R. Cubas

Cuando lo hagas, mándame el comprobante + el dato o DNI a consultar, y te envio los resultados al instante sin perder el tiempo.


---

💳 Métodos de Pago

Frases que reconoce:

¿Cómo pago?
¿Cómo puedo pagar?
¿Métodos de pago?
¿Formas de pago?

Respuesta: Pagas como VIP: Yape, Lemon Cash, Bim, PayPal o depósito directo.
Si no tienes ninguno, puedes pagar en una farmacia, agencia bancaria o pedirle a un amigo. Cuando uno quiere resultados, no pone excusas.


---

Acceso permanente

Frases que reconoce:

Buen día ahí dice hasta el 25 d octubre pero sin embargo ya no me accede a la búsqueda del dni..me indica q tengo q comprar créditos?
No puedo ingresar a mi acceso permanente?
Cuando compré me dijeron que IVA a tener acceso asta el 25 de octubre?

Respuesta: Hola, estimado usuario.
Entendemos tu incomodidad; tu reclamo es válido. Te ofrecimos acceso hasta octubre de 2025 y no lo negamos. Sin embargo, esos accesos antiguos fueron desactivados por causas fuera de nuestro control. Nosotros no esperamos: actuamos. Reestructuramos el sistema de inmediato y aplicamos cambios estratégicos para seguir ofreciendo un servicio de nivel.

Todo esto está respaldado en nuestros Términos y Condiciones, cláusula 11: “Terminación”. Podemos aplicar ajustes cuando la situación lo requiera. Sí, fue un cambio abrupto; sí, lo resolvimos rápido. Porque nosotros vamos primero.

Como agradecimiento por tu lealtad, te regalamos 15 créditos gratuitos para que pruebes los nuevos servicios. Úsalos, y si te gusta, continúas con nosotros. Nadie te obliga; las oportunidades hablan por sí solas.

Gracias por seguir apostando por lo que realmente vale.
Equipo de Soporte – Consulta PE


---

📅 Duración del Acceso

Frases que reconoce:

¿Cuánto dura el acceso?
¿Cada cuánto se paga?
¿Hasta cuándo puedo usar la app?

Respuesta: Tus créditos no caducan; son tuyos para siempre. La duración del acceso a planes premium depende del plan contratado. ¿Se venció tu plan? Solo lo renuevas al mismo precio. ¿Perdiste el acceso? Envía el comprobante y te lo reactivamos sin drama. Aquí no dejamos a nadie atrás.


---

❓ ¿Por qué se paga?

Frases que reconoce:

¿Por qué cobran S/10?
¿Para qué es el pago?
¿Por qué no es gratis?

Respuesta: Porque lo bueno cuesta. Tus pagos mantienen servidores, bases de datos y soporte. Con una sola compra tienes acceso completo y sin límites por búsqueda como en otras apps mediocres. Esto es calidad; pagar es invertir en información que te da ventaja.


---

😕 Si continúa con el mismo problema más de 2 veces

Frases que reconoce: continua con el mismo problema?
No se soluciono nada?
Sigue fallando?
Ya pasó mucho tiempo y no me llega mis créditos dijiste que ya lo activarlas?
Si el usuario insiste que no funciona o no le llegó sus créditos

Respuesta: Tranquilo, sé que no obtuviste exactamente lo que esperabas... todavía.
Estoy en mejora constante; algunas cosas aún están fuera de mi alcance, pero no por mucho tiempo. Ya envié una alerta directa al encargado de soporte: te contactarán y resolverán esto como se debe. Tu caso ya está siendo gestionado. Paciencia, la solución viene en camino. Mientras tanto, no te preocupes, estás en buenas manos.


---

⚠️ Problemas con la App

Frases que reconoce:

¿La app tiene fallas?
¿Hay errores en la app?
La app no funciona bien
No me carga la app
La app está lenta
Tengo un problema con la app

Respuesta: Si algo no te cuadra, mándanos captura y una explicación rápida. Tu experiencia nos importa y vamos a dejar la app al 100%. Lo peor que puedes hacer es quedarte callado: reporta y arreglamos.


---

🙌 Agradecimiento

Frases que reconoce:

¿Te gustó la app?
Gracias, me es útil
Me gusta la app
La app es genial
La app es muy buena

Respuesta: Nos encanta que te encante.
Comparte la app con tus amigos, vecinos o hasta tu ex si quieres. Aquí está el link: https://www.socialcreator.com/consultapeapk
Gracias por ser parte de los que sí resuelven.


---

❌ Eliminar cuenta

Frases que reconoce:

¿Cómo borro mi cuenta?
Quiero eliminar mi usuario
Dar de baja mi cuenta
¿Puedo cerrar mi cuenta?
Quiero eliminar mi cuenta
No quiero usar más la app

Respuesta: ¿Te quieres ir? Bueno… no lo entendemos, pero ok.
Abre tu perfil, entra a Política de privacidad y dale a Darme de baja. Eso sí: el que se va, siempre regresa.


---

Preguntas Fuera de Tema

Frases que reconoce: ¿Qué día es hoy?
¿Cuántos años tengo?
¿Quién ganó el partido?
¿Cuánto es 20x50?
¿Qué signo soy?
¿Qué sistema soy?
¿Cómo descargo Facebook?
¿Cuál es mi número de celular?
¿Qué hora es?
¿Cuál es tu nombre?
¿De dónde eres?
¿Me puedes ayudar con otra cosa?

Respuesta: Atención, crack: soy el asistente oficial de Consulta PE y estoy diseñado para responder únicamente sobre los servicios de esta app. Si quieres consultar un DNI, revisar vehículos, empresas, ver películas, saber si alguien está en la PNP o checar un sismo, estás en el lugar correcto. Yo te guío. Tú dominas.


---

🌐 Bienvenido a Consulta PE APIs

Base URL: https://consulta-pe-apis-data-v2.fly.dev

Querido desarrollador…
Felicitaciones: si estás leyendo esto, tu curiosidad te trajo al lugar correcto. Quien controla la data controla el poder. Prepárate para manejarla con estilo.

Instrucciones de uso

1. Autenticación obligatoria
Cada consulta requiere el header:
x-api-key: TU_API_KEY
Sin eso, la API es como una discoteca sin tu nombre en la lista.


2. Formatos de respuesta
Todas las respuestas llegan en JSON limpio y optimizado. Si ves un campo raro como developed-by, tranquilo: nosotros lo filtramos.


3. Créditos y planes
Si tienes plan por créditos → cuídalos como vidas en un videojuego.
Si tienes plan ilimitado → úsalo con cabeza; nadie necesita quemarse.


4. Códigos de error
401 → Olvidaste tu API Key.
402 → Se acabaron tus créditos.
403 → Tu plan caducó.
500 → Aquí la culpa es nuestra; inténtalo más tarde.



Recomendaciones prácticas
No abuses: esto no es buffet libre.
Haz logs de tus consultas para rastrear gasto.
Guarda cache: tu aplicación será más rápida y parecerás un genio.

FAQ (Preguntas Frecuentes)

1. ¿Tengo que recargar aparte para consultar en la app y aparte para la API?
No, crack. Compras tus créditos desde 10 soles y se cargan a tu cuenta. Es un solo saldo que sirve para la app y para las APIs.


2. ¿Ofrecen planes ilimitados?
Sí, pero la mayoría prefiere créditos porque pagan solo por lo que usan. Si quieres buffet, lo tenemos; pero la gente inteligente elige créditos.


3. Métodos de pago (compra de créditos)
Aquí pagas como VIP: Yape, Lemon Cash, Bim, PayPal o depósito directo. No hay excusas.


4. ¿Puedo compartir mi API Key?
Claro, si quieres quedarte sin créditos en tiempo récord.


5. ¿Los datos son 100% reales?
Sí… y no. Usamos fuentes oficiales y privadas de confianza, pero si aparece algo raro no nos responsabilizamos por lo que tu primo hizo en la vida.


6. ¿Puedo hacer scraping mejor que esto?
Puedes intentarlo, pero mientras tú peleas con captchas, nosotros te servimos el JSON en bandeja.


7. ¿Qué pasa si le pego 1 millón de requests en un día?
Tu cuenta se suspende. Y nuestra API se ríe de ti.


8. ¿Me harán descuento si uso mucho?
No, como en Netflix: ver sin parar no trae descuentos.



⚠️ Renuncia de responsabilidad

Consulta PE no es RENIEC, SUNAT, MTC ni la Fiscalía. La información proviene de fuentes públicas y privadas de terceros. Esto es para fines informativos y educativos. No lo uses para acosar, perseguir ni hacer daño. Y por favor, no nos demandes: nuestros abogados cobran más que tus créditos.

😂 Un par de chistes

¿Qué hace un developer cuando le faltan créditos? → Llora en JSON.
Nuestra API es como tu crush: responde rápido si le hablas bonito… pero si la spameas, te deja en visto.

🌟 En resumen: Usa la API, crea cosas increíbles… pero recuerda quién te dio el poder: Consulta PE. Sin nosotros, tu app sería solo un Hola Mundo aburrido.

🔹 Básicos v1 (7- Consulta Pe)

1. Consultar DNI
GET https://consulta-pe-apis-data-v2.fly.dev/api/dni?dni=12345678


2. Consultar RUC
GET https://consulta-pe-apis-data-v2.fly.dev/api/ruc?ruc=10412345678


3. Consultar Anexos RUC
GET https://consulta-pe-apis-data-v2.fly.dev/api/ruc-anexo?ruc=10412345678


4. Consultar Representantes RUC
GET https://consulta-pe-apis-data-v2.fly.dev/api/ruc-representante?ruc=10412345678


5. Consultar CEE
GET https://consulta-pe-apis-data-v2.fly.dev/api/cee?cee=123456789


6. Consultar SOAT por Placa
GET https://consulta-pe-apis-data-v2.fly.dev/api/soat-placa?placa=ABC123


7. Consultar Licencia por DNI
GET https://consulta-pe-apis-data-v2.fly.dev/api/licencia?dni=12345678



🔹 Avanzados v2 (Consulta Pe– 23)

8. Ficha RENIEC en Imagen
GET https://consulta-pe-apis-data-v2.fly.dev/api/ficha?dni=12345678


9. RENIEC Datos Detallados
GET https://consulta-pe-apis-data-v2.fly.dev/api/reniec?dni=12345678


10. Denuncias por DNI
GET https://consulta-pe-apis-data-v2.fly.dev/api/denuncias-dni?dni=12345678


11. Denuncias por Placa
GET https://consulta-pe-apis-data-v2.fly.dev/api/denuncias-placa?placa=ABC123


12. Historial de Sueldos
GET https://consulta-pe-apis-data-v2.fly.dev/api/sueldos?dni=12345678


13. Historial de Trabajos
GET https://consulta-pe-apis-data-v2.fly.dev/api/trabajos?dni=12345678


14. Consulta SUNAT por RUC/DNI
GET https://consulta-pe-apis-data-v2.fly.dev/api/sunat?data=10412345678


15. SUNAT Razón Social
GET https://consulta-pe-apis-data-v2.fly.dev/api/sunat-razon?data=Mi Empresa SAC


16. Historial de Consumos
GET https://consulta-pe-apis-data-v2.fly.dev/api/consumos?dni=12345678


17. Árbol Genealógico
GET https://consulta-pe-apis-data-v2.fly.dev/api/arbol?dni=12345678


18. Familia 1
GET https://consulta-pe-apis-data-v2.fly.dev/api/familia1?dni=12345678


19. Familia 2
GET https://consulta-pe-apis-data-v2.fly.dev/api/familia2?dni=12345678


20. Familia 3
GET https://consulta-pe-apis-data-v2.fly.dev/api/familia3?dni=12345678


21. Movimientos Migratorios
GET https://consulta-pe-apis-data-v2.fly.dev/api/movimientos?dni=12345678


22. Matrimonios
GET https://consulta-pe-apis-data-v2.fly.dev/api/matrimonios?dni=12345678


23. Empresas Relacionadas
GET https://consulta-pe-apis-data-v2.fly.dev/api/empresas?dni=12345678


24. Direcciones Relacionadas
GET https://consulta-pe-apis-data-v2.fly.dev/api/direcciones?dni=12345678


25. Correos Electrónicos
GET https://consulta-pe-apis-data-v2.fly.dev/api/correos?dni=12345678


26. Telefonía por Documento
GET https://consulta-pe-apis-data-v2.fly.dev/api/telefonia-doc?documento=12345678


27. Telefonía por Número
GET https://consulta-pe-apis-data-v2.fly.dev/api/telefonia-num?numero=987654321


28. Vehículos por Placa
GET https://consulta-pe-apis-data-v2.fly.dev/api/vehiculos?placa=ABC123


29. Fiscalía por DNI
GET https://consulta-pe-apis-data-v2.fly.dev/api/fiscalia-dni?dni=12345678


30. Fiscalía por Nombres
GET https://consulta-pe-apis-data-v2.fly.dev/api/fiscalia-nombres?nombres=Juan&apepaterno=Perez&apematerno=Gomez



🔹 Extra (PDF – 1)

31. Ficha Completa en PDF
GET https://consulta-pe-apis-data-v2.fly.dev/api/info-total?dni=12345678

---

📢 Ejemplos de Respuesta

Si ya enviaron el comprobante pero falta el correo:
👉 “¡Pago recibido! 🎉 Ahora solo necesito tu correo para activar todo en tu cuenta. Así tendrás acceso completo a Consulta PE sin demoras 😉.”

Si preguntan cómo estás:
👉 “Todo excelente 💪, siempre listo para ayudarte. Y hablando de cosas buenas, ¿quieres que te muestre cómo sacarle el máximo provecho a tu consulta de DNI?”

Si te dicen algo fuera de contexto:
👉 “Jajaja, buena esa 😂. Pero ojo, hablando de cosas reales, ¿sabías que con Consulta PE puedes averiguar el RUC solo con el DNI? Eso sí que es de otro planeta 🚀.”


---

🎁 Consejo extra

Siempre que sea posible, sugiere al cliente probar otra categoría de servicio.
Ejemplo:
👉 “Ya terminé con tu consulta de DNI ✅. Por cierto, ¿queres que te muestre también cómo consultar el RUC o el estado de trámite de tu documento? Te puede servir más de lo que imaginas 😉.”

---

---
Historial de conversación:
`;
let COHERE_PROMPT = "";
let OPENAI_PROMPT = "";

// Prompts y datos para el pago
const YAPE_PROMPT = `¡Listo, leyenda! Elige la cantidad de poder que quieres, escanea el QR y paga directo por Yape.

*Monto:* S/{{monto}}
*Créditos:* {{creditos}}
*Yape:* ${YAPE_NUMBER}
*Titular:* José R. Cubas

Una vez que pagues, envía el comprobante y tu correo registrado en la app. Te activamos los créditos al toque. No pierdas tiempo.

`;
const PACKAGES = {
    '10': { amount: 10, credits: 60, qr_url: LEMON_QR_IMAGE },
    '20': { amount: 20, credits: 125, qr_url: LEMON_QR_IMAGE },
    '50': { amount: 50, credits: 330, qr_url: LEMON_QR_IMAGE },
    '100': { amount: 100, credits: 700, qr_url: LEMON_QR_IMAGE },
    '200': { amount: 200, credits: 1500, qr_url: LEMON_QR_IMAGE },
};
// Respuestas locales y menús
let respuestasPredefinidas = {};


// --- API CLients (OpenAI, Gemini) ---

// OpenAI Client
let openaiClient;
try {
  if (OPENAI_API_KEY) {
    const { OpenAI } = await import("openai");
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
} catch (err) {
  console.error("Error importando OpenAI:", err.message || err);
}

// Gemini Vision API (for images) - CORREGIDO A V1
const geminiVisionApi = axios.create({
  baseURL: "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent", // Usando v1 para modelos estables
  params: { key: GEMINI_API_KEY || OPENAI_API_KEY }, // Usamos la clave que tengamos disponible para pruebas
  timeout: 30000,
});

// Google Speech-to-Text
const googleSpeechToTextApi = axios.create({
  baseURL: "https://speech.googleapis.com/v1p1beta1/speech:recognize",
  params: { key: GOOGLE_CLOUD_API_KEY },
  timeout: 30000,
});

// ------------------- Gemini (TEXTO) - CORREGIDO A V1 Y gemini-2.5-flash -------------------
const consumirGemini = async (prompt) => {
  try {
    const keyToUse = GEMINI_API_KEY || OPENAI_API_KEY; 
    if (!keyToUse) {
      console.log("GEMINI_API_KEY o OPENAI_API_KEY no están configuradas para Gemini.");
      return null;
    }
    const model = "gemini-2.5-flash"; // Usando el modelo accesible en V1
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${keyToUse}`; // Corregido a v1
    
    // Se combina el prompt de sistema y el mensaje del usuario de forma más robusta
    const fullPrompt = `${GEMINI_PROMPT}\nUsuario: ${prompt}`;

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: fullPrompt }
          ]
        }
      ]
    };
    
    const response = await axios.post(url, body, { timeout: 20000 }); // Aumentado el timeout por el prompt largo
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    return text ? text.trim() : null;
  } catch (err) {
    console.error("Error al consumir Gemini API:", err.response?.data?.error || err.message);
    return null;
  }
};

// ------------------- OpenAI (TEXTO) -------------------
const consumirOpenAI = async (prompt) => {
  try {
    if (!openaiClient) {
      console.log("OPENAI_API_KEY o Cliente OpenAI no está configurado.");
      return null;
    }
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: OPENAI_PROMPT || GEMINI_PROMPT.replace(/Historial de conversación:\s*$/, '') }, // Usar el prompt de Gemini si el de OpenAI está vacío
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
    });
    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error("Error al consumir OpenAI API:", err.message);
    return null;
  }
};


// ------------------- Gemini/OpenAI (VISIÓN - FOTOS/IMAGENES) -------------------
const sendToVisionAI = async (imageBuffer) => {
    const base64Image = imageBuffer.toString('base64');
    const prompt = `Analiza esta imagen y describe lo que ves. Si parece un comprobante de pago de Yape, BCP u otro banco peruano, responde con el texto exacto: "Comprobante de pago". Si es una imagen genérica, descríbela en una oración.`;
    
    // Si activeAI es "openai", usar OpenAI Vision. SINO, usar Gemini Vision
    if (activeAI === "openai" && openaiClient) {
        try {
            const response = await openaiClient.chat.completions.create({
                model: "gpt-4o-mini", // Modelo compatible con visión
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            {
                                type: "image_url",
                                image_url: { url: `data:image/jpeg;base64,${base64Image}` },
                            },
                        ],
                    },
                ],
            });
            return response.choices[0].message.content.trim();
        } catch (error) {
            console.error("Error al analizar la imagen con OpenAI Vision:", error.message);
            return "Lo siento, no pude analizar esa imagen en este momento con OpenAI.";
        }
    } else { // Usar Gemini Vision (comportamiento original, ahora con URL de V1)
        try {
            const response = await geminiVisionApi.post("", {
                contents: [
                    {
                        role: "user",
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: "image/jpeg", data: base64Image } },
                        ],
                    },
                ],
            });
            const text = response.data.candidates[0].content.parts[0].text;
            return text ? text.trim() : null;
        } catch (error) {
            console.error("Error al analizar la imagen con Gemini Vision:", error.response?.data || error.message);
            return "Lo siento, no pude analizar esa imagen en este momento con Gemini.";
        }
    }
};

const sendAudioToGoogleSpeechToText = async (audioBuffer) => {
    try {
        if (!GOOGLE_CLOUD_API_KEY || GOOGLE_CLOUD_API_KEY.includes("TuClaveDeGoogleCloud")) {
            return "Lo siento, la clave de Google Cloud API no está configurada para la transcripción de audio. Por favor, escribe tu mensaje.";
        }
        const audio = audioBuffer.toString('base64');
        const request = {
            audio: { content: audio },
            config: {
                encoding: "OGG_OPUS",
                sampleRateHertz: 16000,
                languageCode: "es-PE",
                model: "default",
            },
        };

        const response = await googleSpeechToTextApi.post("", request);
        const transcript = response.data?.results?.[0]?.alternatives?.[0]?.transcript;
        return transcript || "No se pudo transcribir el audio. Por favor, escribe tu mensaje.";
    } catch (error) {
        console.error("Error al transcribir el audio con Google Speech-to-Text:", error.response?.data || error.message);
        return "Lo siento, no pude procesar el audio en este momento.";
    }
};

// ------------------- Cohere -------------------
// NOTA: Se mantiene la estructura para Cohere aunque la clave no se lea de .env.
// Se recomienda hardcodear la clave en una variable aquí si se va a usar.
const consumirCohere = async (prompt) => {
  try {
    const COHERE_API_KEY = ""; // Clave hardcodeada para Cohere si se necesitara.
    if (!COHERE_API_KEY) {
      console.log("COHERE_API_KEY no está configurada.");
      return null;
    }
    const url = "https://api.cohere.ai/v1/chat";
    const headers = {
      "Authorization": `Bearer ${COHERE_API_KEY}`,
      "Content-Type": "application/json"
    };
    const data = {
      chat_history: [
        {
          role: "SYSTEM",
          message: COHERE_PROMPT || GEMINI_PROMPT.replace(/Historial de conversación:\s*$/, '')
        }
      ],
      message: prompt
    };

    const response = await axios.post(url, data, { headers, timeout: 15000 });
    return response.data?.text?.trim() || null;
  } catch (err) {
    console.error("Error al consumir Cohere API:", err.response?.data?.message || err.message);
    return null;
  }
};

// ------------------- Respuestas Locales -------------------
function obtenerRespuestaLocal(texto) {
  const key = texto.toLowerCase().trim();
  const respuesta = respuestasPredefinidas[key];
  if (respuesta) {
    return Array.isArray(respuesta) ? respuesta[Math.floor(Math.random() * respuesta.length)] : respuesta;
  }
  return null;
}

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

const formatText = (text, style) => {
  switch (style) {
    case 'bold':
      return `*${text}*`;
    case 'italic':
      return `_${text}_`;
    case 'strike':
      return `~${text}~`;
    case 'mono':
      return '```' + text + '```';
    default:
      return text;
  }
};

const forwardToAdmins = async (sock, message, customerNumber) => {
  // Asegurarse de que el número de admin sea un JID válido
  const adminNumbers = [
    ADMIN_NUMBER ? `${ADMIN_NUMBER}@s.whatsapp.net` : null, 
    "51965993244@s.whatsapp.net" // Número de ejemplo
  ].filter(Boolean); 

  const forwardedMessage = `*REENVÍO AUTOMÁTICO DE SOPORTE*
  
*Cliente:* wa.me/${customerNumber.replace("@s.whatsapp.net", "")}

*Mensaje del cliente:*
${message}
  
*Enviado por el Bot para atención inmediata.*`;

  for (const admin of adminNumbers) {
    await sock.sendMessage(admin, { text: forwardedMessage });
  }
};

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
  
  // Manejo de llamadas: rechazarlas automáticamente
  sock.ev.on("call", async (calls) => {
    for (const call of calls) {
      if (call.status === 'offer' || call.status === 'ringing') {
        console.log(`Llamada entrante de ${call.from}. Rechazando...`);
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
      
      // Rechazar mensajes de llamadas
      if (msg.messageStubType === proto.WebMessageInfo.StubType.CALL_MISSED_VOICE || msg.messageStubType === proto.WebMessageInfo.StubType.CALL_MISSED_VIDEO) {
        await sock.sendMessage(from, { text: "Hola, soy un asistente virtual y solo atiendo por mensaje de texto. Por favor, escribe tu consulta por aquí." });
        continue;
      }
      
      let body = "";
      let manualMessageReply = false;
      let mediaType = null;
      let mediaUrl = null;

      // START OF NEW LOGIC FOR MANUAL MESSAGE REPLIES
      const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (quotedMessage) {
        const originalMessageText = quotedMessage?.conversation || quotedMessage?.extendedTextMessage?.text;
        if (originalMessageText && originalMessageText.includes("###MANUAL_MESSAGE_REPLY_ID###")) {
          manualMessageReply = true;
          
          let content = null;

          if (msg.message.conversation) {
            content = msg.message.conversation;
          } else if (msg.message.extendedTextMessage) {
            content = msg.message.extendedTextMessage.text;
          } else if (msg.message.imageMessage) {
            mediaType = "image";
            mediaUrl = await getDownloadURL(msg.message.imageMessage, 'image');
            content = "imagen generada";
          } else if (msg.message.documentMessage) {
            mediaType = "document";
            mediaUrl = await getDownloadURL(msg.message.documentMessage, 'document');
            content = "pdf generada";
          }
          
          const payload = {
            message: "found data",
            result: {
              quantity: 1,
              coincidences: [{
                message: content,
                url: mediaUrl,
              }],
            },
          };
          
          try {
            await axios.post('http://tu-interfaz-de-usuario.com/webhook', payload); // Replace with your actual webhook URL
            console.log("Payload enviado a la interfaz:", payload);
            // Optionally, send a confirmation to the user
            await sock.sendMessage(from, { text: "¡Recibido! Tu respuesta ha sido procesada." });
          } catch (error) {
            console.error("Error al enviar el payload a la interfaz:", error.message);
          }
          
          continue; // Stop further processing for this message
        }
      }
      // END OF NEW LOGIC

      // Manejar diferentes tipos de mensajes
      if (msg.message.conversation) {
        body = msg.message.conversation;
      } else if (msg.message.extendedTextMessage) {
        body = msg.message.extendedTextMessage.text;
      } else if (msg.message.imageMessage) {
        const imageBuffer = await downloadContentFromMessage(msg.message.imageMessage, 'image');
        let bufferArray = [];
        for await (const chunk of imageBuffer) {
            bufferArray.push(chunk);
        }
        const buffer = Buffer.concat(bufferArray);
        body = await sendToVisionAI(buffer); // Envía la imagen a la AI de Visión (OpenAI o Gemini)
      } else if (msg.message.audioMessage) {
          const audioBuffer = await downloadContentFromMessage(msg.message.audioMessage, 'audio');
          let bufferArray = [];
          for await (const chunk of audioBuffer) {
            bufferArray.push(chunk);
          }
          const buffer = Buffer.concat(bufferArray);
          body = await sendAudioToGoogleSpeechToText(buffer); // Transcribe el audio a texto
      } else {
          await sock.sendMessage(from, { text: "Lo siento, solo puedo procesar mensajes de texto, imágenes y audios. Por favor, envía tu consulta en uno de esos formatos." });
          continue;
      }
      
      if (!body) continue;

      // Comando de administrador
      const is_admin = from.startsWith(ADMIN_NUMBER);
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
          case "useai":
            if (["gemini", "cohere", "openai", "local"].includes(arg)) {
              activeAI = arg;
              await sock.sendMessage(from, { text: `✅ Ahora estoy usando: ${activeAI}.` });
            } else {
              await sock.sendMessage(from, { text: "❌ Comando inválido. Usa: /useai <gemini|cohere|openai|local>" });
            }
            break;
          case "setgeminiprompt":
            GEMINI_PROMPT = arg;
            await sock.sendMessage(from, { text: "✅ Prompt de Gemini actualizado." });
            break;
          case "setcohereprompt":
            COHERE_PROMPT = arg;
            await sock.sendMessage(from, { text: "✅ Prompt de Cohere actualizado." });
            break;
          case "setopenaiprompt":
            OPENAI_PROMPT = arg;
            await sock.sendMessage(from, { text: "✅ Prompt de OpenAI actualizado." });
            break;
          case "addlocal":
            if (parts.length >= 2) {
              respuestasPredefinidas[parts[0].replace("addlocal ", "").toLowerCase()] = parts[1];
              await sock.sendMessage(from, { text: `✅ Respuesta local para '${parts[0].replace("addlocal ", "")}' agregada.` });
            } else {
              await sock.sendMessage(from, { text: "❌ Comando inválido. Usa: /addlocal <pregunta> | <respuesta>" });
            }
            break;
          case "editlocal":
            if (parts.length >= 2) {
              respuestasPredefinidas[parts[0].replace("editlocal ", "").toLowerCase()] = parts[1];
              await sock.sendMessage(from, { text: `✅ Respuesta local para '${parts[0].replace("editlocal ", "")}' editada.` });
            } else {
              await sock.sendMessage(from, { text: "❌ Comando inválido. Usa: /editlocal <pregunta> | <nueva_respuesta>" });
            }
            break;
          case "deletelocal":
            const keyToDelete = parts[0].replace("deletelocal ", "").toLowerCase();
            if (respuestasPredefinidas[keyToDelete]) {
              delete respuestasPredefinidas[keyToDelete];
              await sock.sendMessage(from, { text: `✅ Respuesta local para '${keyToDelete}' eliminada.` });
            } else {
              await sock.sendMessage(from, { text: "❌ La respuesta local no existe." });
            }
            break;
          case "setwelcome":
            welcomeMessage = arg;
            await sock.sendMessage(from, { text: "✅ Mensaje de bienvenida actualizado." });
            break;
          case "sendmedia":
            const [targetNumber, url, type, caption = ""] = parts.slice(1);
            if (!targetNumber || !url || !type) {
                await sock.sendMessage(from, { text: "❌ Uso: /sendmedia | <número_destino> | <url> | <tipo> | [caption]" });
                return;
            }
            const jid = `${targetNumber}@s.whatsapp.net`;
            try {
                const response = await axios.get(url, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(response.data);
                const mediaMsg = { [type]: buffer, caption: caption };
                await sock.sendMessage(jid, mediaMsg);
            } catch (error) {
                await sock.sendMessage(from, { text: "❌ Error al enviar el archivo." });
            }
            break;
          case "sendbulk":
            const [numbers, message] = parts.slice(1);
            if (!numbers || !message) {
                await sock.sendMessage(from, { text: "❌ Uso: /sendbulk | <num1,num2,...> | <mensaje>" });
                return;
            }
            const numberList = numbers.split(",").map(num => `${num}@s.whatsapp.net`);
            for (const number of numberList) {
                // We add the unique ID to the message body
                const manualMessageText = `${message}\n\n###MANUAL_MESSAGE_REPLY_ID###`;
                await sock.sendMessage(number, { text: manualMessageText });
                await wait(1500);
            }
            await sock.sendMessage(from, { text: `✅ Mensaje enviado a ${numberList.length} contactos.` });
            break;
          case "status":
            await sock.sendMessage(from, { text: `
              📊 *Estado del Bot* 📊
              Estado de conexión: *${sessions.get(sessionId).status}*
              IA activa: *${activeAI}*
              Bot pausado: *${botPaused ? "Sí" : "No"}*
              Número de respuestas locales: *${Object.keys(respuestasPredefinidas).length}*
              Mensaje de bienvenida: *${welcomeMessage}*
            `});
            break;
          default:
            await sock.sendMessage(from, { text: "❌ Comando de administrador no reconocido." });
        }
        return; // Detener el procesamiento si es un comando de admin
      }

      if (botPaused) return;
      
      // Control de saludos y fluidez de la conversación
      const now = Date.now();
      const lastInteraction = userStates.get(from)?.lastInteraction || 0;
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const isNewDay = (now - lastInteraction) > twentyFourHours;

      if (isNewDay && !body.toLowerCase().includes("hola")) {
          // El bot puede comenzar la conversación con un saludo
          const userState = userStates.get(from) || {};
          const isFirstMessage = !userState.messageCount;
          
          if (isFirstMessage) {
            await sock.sendMessage(from, { text: welcomeMessage });
          }
      }
      userStates.set(from, { lastInteraction: now, messageCount: (userStates.get(from)?.messageCount || 0) + 1 });
      
      // Lógica para el manejo de "comprobante de pago"
      if (body.toLowerCase().includes("comprobante de pago")) {
        // Asume que la imagen es un comprobante. 
        
        const adminNumbers = [
            ADMIN_NUMBER ? `${ADMIN_NUMBER}@s.whatsapp.net` : null, 
            "51965993244@s.whatsapp.net"
        ].filter(Boolean);
        
        const forwardMessage = `*PAGO PENDIENTE DE ACTIVACIÓN*
  
*Cliente:* ${customerNumber.replace("@s.whatsapp.net", "")}
*Mensaje:* El cliente ha enviado un comprobante.
*Solicitud:* Activar créditos para este usuario.`;

        for (const admin of adminNumbers) {
            await sock.sendMessage(admin, { text: forwardMessage });
            await wait(500); // Pausa para no saturar
        }

        // Respuesta al cliente
        await sock.sendMessage(from, { text: "¡Recibido! He reenviado tu comprobante a nuestro equipo de soporte para que activen tus créditos de inmediato. Te avisaremos en cuanto estén listos." });
        continue; // Detener el procesamiento de la IA
      }

      // Lógica para detectar la elección del paquete
      let paqueteElegido = null;
      const lowerCaseBody = body.toLowerCase().trim();

      for (const [key, value] of Object.entries(PACKAGES)) {
        if (lowerCaseBody.includes(key) || lowerCaseBody.includes(`paquete de ${key}`)) {
          paqueteElegido = value;
          break;
        }
      }

      if (paqueteElegido) {
        try {
          // Cargar la imagen del QR
          const qrImageUrl = paqueteElegido.qr_url;
          if (!qrImageUrl) throw new Error("URL de QR no configurada");
          
          const qrImageBuffer = await axios.get(qrImageUrl, { responseType: 'arraybuffer' });
          const qrImage = Buffer.from(qrImageBuffer.data, 'binary');

          // Generar el mensaje de texto
          const textMessage = YAPE_PROMPT
            .replace('{{monto}}', paqueteElegido.amount)
            .replace('{{creditos}}', paqueteElegido.credits);
            
          // Enviar la imagen y el texto en un solo mensaje
          await sock.sendMessage(from, {
            image: qrImage,
            caption: textMessage
          });
          continue; // Detener el procesamiento de la IA
        } catch (error) {
          console.error("Error al enviar el mensaje con QR:", error.message);
          await sock.sendMessage(from, { text: "Lo siento, hubo un problema al generar los datos de pago. Por favor, inténtalo de nuevo o contacta a soporte." });
          continue;
        }
      }
      
      // Lógica de "manipulación" (fidelización)
      const isReturningCustomer = userStates.get(from)?.purchases > 0;
      const giftCredits = isReturningCustomer ? 3 : 1;
      const giftMessage = `¡Como valoramos tu confianza, te hemos regalado ${giftCredits} crédito${giftCredits > 1 ? 's' : ''} extra en tu cuenta! 🎁`;
      
      
      if (body.toLowerCase().includes("ya hice el pago")) {
          // Lógica de regalo
          await sock.sendMessage(from, { text: giftMessage });
          // Incrementa el contador de compras del usuario para futuras interacciones
          const userState = userStates.get(from) || {};
          userState.purchases = (userState.purchases || 0) + 1;
          userStates.set(from, userState);
      }
      
      // Si el bot no puede solucionar el problema, reenviar a los encargados (lógica de fallback duplicada, eliminada aquí)
      
      // Evitar que el bot responda "Lo siento, no pude..."
      let reply = "";
      
      // Calcular tiempo de "composing" (escribiendo) dinámicamente
      const calculateTypingTime = (textLength) => {
        const msPerChar = 40; // milisegundos por caracter
        const maxTime = 5000; // Máximo 5 segundos de "escribiendo"
        return Math.min(textLength * msPerChar, maxTime);
      };

      await sock.sendPresenceUpdate("composing", from);
      
      // Priorizar respuestas locales si existen
      reply = obtenerRespuestaLocal(body);

      // Si no hay respuesta local, usar la IA activa
      if (!reply) {
        let aiUsed = activeAI;
        let originalReply = null;
        
        switch (activeAI) {
          case "gemini":
            originalReply = await consumirGemini(body);
            break;
          case "cohere":
            originalReply = await consumirCohere(body);
            break;
          case "openai":
            originalReply = await consumirOpenAI(body); // Usar OpenAI para texto
            break;
          case "local":
            originalReply = "🤔 No se encontró respuesta local. El modo local está activo.";
            break;
          default:
            // Intentar con OpenAI si la IA activa es inválida
            originalReply = await consumirOpenAI(body);
            aiUsed = "openai (fallback)";
            break;
        }

        reply = originalReply;
        
        // --- LÓGICA DE FALLO CORREGIDA Y MEJORADA ---
        if (!reply || reply.includes("no pude encontrar una respuesta") || reply.includes("Lo siento, no pude procesar el audio") || reply.includes("Lo siento, no pude analizar esa imagen")) {
             // 1. Si falló la IA activa, intentar con el otro servicio (OpenAI o Gemini)
            if (aiUsed === "openai" || aiUsed === "cohere") {
                console.log(`[FALLBACK] Falló ${aiUsed}. Intentando con Gemini como respaldo...`);
                reply = await consumirGemini(body);
                aiUsed = "gemini (fallback)";
            } else if (aiUsed.startsWith("gemini")) {
                console.log(`[FALLBACK] Falló Gemini. Intentando con OpenAI como respaldo...`);
                reply = await consumirOpenAI(body);
                aiUsed = "openai (fallback)";
            }
            
            // 2. Si incluso el respaldo falla, entonces se escala a soporte
            if (!reply || reply.includes("no pude encontrar una respuesta") || reply.includes("Lo siento, no pude procesar el audio") || reply.includes("Lo siento, no pude analizar esa imagen")) {
                console.log(`[ESCALADA] Falló la IA y el respaldo. Reenviando a administradores.`);
                await forwardToAdmins(sock, body, customerNumber);
                reply = "Ya envié una alerta a nuestro equipo de soporte. Un experto se pondrá en contacto contigo por este mismo medio en unos minutos para darte una solución. Estamos en ello.";
            }
        }
      }

      // Finalizar "composing"
      await wait(calculateTypingTime(reply.length));
      await sock.sendPresenceUpdate("paused", from);

      // Dividir y enviar el mensaje
      const replyLength = reply.length;
      let parts = [reply];

      if (replyLength > 2000) { // Nuevo umbral para la división
        const chunkSize = Math.ceil(replyLength / 2);
        parts = [reply.substring(0, chunkSize), reply.substring(chunkSize)];
      }
      
      for (const p of parts) {
        await sock.sendMessage(from, { text: p });
        await wait(1000 + Math.random() * 500); // Pequeña pausa entre mensajes divididos
      }
    }
  });

  return sock;
};

// Function to get a temporary URL for downloaded media
const getDownloadURL = async (message, type) => {
    // Implementación omitida por ser una utilidad, se mantiene el placeholder.
    return `http://your-server.com/media/placeholder`;
};

const streamToBuffer = (stream) => {
  return new Promise((resolve, reject) => {
    const buffers = [];
    stream.on('data', chunk => buffers.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(buffers)));
    stream.on('error', err => reject(err));
  });
};

// ------------------- Endpoints -------------------
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
      // Reutilizar la lógica de comandos de administrador
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

app.listen(PORT, () => console.log(`🚀 Server en puerto ${PORT}`));
