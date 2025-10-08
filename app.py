import os
from flask import Flask, jsonify
from scheduler import start_scheduler

app = Flask(__name__)

@app.route('/')
def index():
    return jsonify({"status": "tio-jota-bot running"})

if __name__ == '__main__':
    # Levanta el scheduler en background
    start_scheduler()
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
