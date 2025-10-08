# -------------------------------
# AVISO IMPORTANTE:
# Responder automáticamente comentarios en YouTube requiere credenciales OAuth 2.0
# con alcance: https://www.googleapis.com/auth/youtube.force-ssl
# Este archivo es un placeholder que muestra la estructura. Debes crear un proyecto
# en Google Cloud, habilitar OAuth y descargar credentials.json.
# -------------------------------

import os

def reply_to_comment_placeholder(comment_id, text):
    # Aquí debes implementar OAuth y usar youtube.comments().insert(...) con el token
    print(f"Placeholder: responder comentario {comment_id} con: {text}")

# Recomendación de flujo:
# 1. Implementar OAuth con google-auth-oauthlib.
# 2. Guardar refresh token seguro y usarlo para solicitudes de escritura.
