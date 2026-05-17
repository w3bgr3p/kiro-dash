#!/bin/bash

# Kiro Dashboard Launcher
# Запускает API сервер и открывает dashboard в браузере

echo "🚀 Starting Kiro Quota Dashboard..."
echo ""

# Проверка, что Node.js установлен
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Проверка, что БД существует
DB_PATH="$HOME/.omniroute/storage.sqlite"
if [ ! -f "$DB_PATH" ]; then
    echo "❌ Error: OmniRoute database not found at $DB_PATH"
    echo "Make sure OmniRoute is installed and running"
    exit 1
fi

# Проверка, что порт свободен
if lsof -Pi :20129 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Port 20129 is already in use"
    echo "API server might already be running"
    echo ""
else
    # Запуск API сервера
    echo "📡 Starting API server on port 20129..."
    nohup node "$HOME/kiro_dashboard_server.js" > "$HOME/kiro_dashboard.log" 2>&1 &
    SERVER_PID=$!
    echo "✅ API server started (PID: $SERVER_PID)"
    echo "📝 Logs: $HOME/kiro_dashboard.log"
    echo ""
    sleep 2
fi

# Проверка, что сервер работает
if curl -s http://localhost:20129/api/summary > /dev/null 2>&1; then
    echo "✅ API server is responding"
else
    echo "⚠️  API server might not be ready yet, waiting..."
    sleep 3
fi

echo ""
echo "🌐 Opening dashboard in browser..."

# Открытие dashboard в браузере
DASHBOARD_PATH="$HOME/kiro_quota_dashboard_v2.html"

if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    # Windows
    start "$DASHBOARD_PATH"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open "$DASHBOARD_PATH"
else
    # Linux
    xdg-open "$DASHBOARD_PATH" 2>/dev/null || sensible-browser "$DASHBOARD_PATH" 2>/dev/null
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Kiro Quota Dashboard is running!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Dashboard: file://$DASHBOARD_PATH"
echo "🔗 API Server: http://localhost:20129"
echo "📝 Logs: $HOME/kiro_dashboard.log"
echo ""
echo "Commands:"
echo "  View logs:    tail -f $HOME/kiro_dashboard.log"
echo "  Stop server:  pkill -f kiro_dashboard_server.js"
echo "  Quick check:  bash $HOME/analyze_kiro_quotas_simple.sh"
echo ""
echo "Dashboard will auto-refresh every 60 seconds"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
