@echo off
REM Kiro Dashboard Launcher for Windows
REM Запускает API сервер и открывает dashboard в браузере

echo 🚀 Starting Kiro Quota Dashboard...
echo.

REM Проверка, что Node.js установлен
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Error: Node.js is not installed
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Проверка, что БД существует
set DB_PATH=%USERPROFILE%\.omniroute\storage.sqlite
if not exist "%DB_PATH%" (
    echo ❌ Error: OmniRoute database not found at %DB_PATH%
    echo Make sure OmniRoute is installed and running
    pause
    exit /b 1
)

REM Проверка, что порт свободен
netstat -ano | findstr ":20129" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ⚠️  Port 20129 is already in use
    echo API server might already be running
    echo.
) else (
    REM Запуск API сервера в фоне
    echo 📡 Starting API server on port 20129...
    set LOG_FILE=%USERPROFILE%\kiro_dashboard.log
    start /B node "%~dp0kiro_dashboard_server.js" > "%LOG_FILE%" 2>&1
    echo ✅ API server started
    echo 📝 Logs: %LOG_FILE%
    echo.
    timeout /t 2 /nobreak >nul
)

REM Проверка, что сервер работает
curl -s http://localhost:20129/api/summary >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✅ API server is responding
) else (
    echo ⚠️  API server might not be ready yet, waiting...
    timeout /t 3 /nobreak >nul
)

echo.
echo 🌐 Opening dashboard in browser...

REM Открытие dashboard в браузере
set DASHBOARD_PATH=%~dp0Kiro Quota Dashboard.html
start "" "%DASHBOARD_PATH%"

echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ✅ Kiro Quota Dashboard is running!
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 📊 Dashboard: file:///%DASHBOARD_PATH%
echo 🔗 API Server: http://localhost:20129
echo 📝 Logs: %USERPROFILE%\kiro_dashboard.log
echo.
echo Commands:
echo   View logs:    type %USERPROFILE%\kiro_dashboard.log
echo   Stop server:  taskkill /F /IM node.exe /FI "WINDOWTITLE eq kiro_dashboard_server.js"
echo.
echo Dashboard will auto-refresh every 60 seconds
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
pause
