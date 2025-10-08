import os
from telegram import Bot

TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN')
TELEGRAM_CHAT_ID = os.environ.get('TELEGRAM_CHAT_ID')

bot = Bot(token=TELEGRAM_BOT_TOKEN) if TELEGRAM_BOT_TOKEN else None

def send_telegram_message(text):
    if not bot or not TELEGRAM_CHAT_ID:
        print('Telegram no configurado. Mensaje:', text)
        return
    bot.send_message(chat_id=TELEGRAM_CHAT_ID, text=text)
