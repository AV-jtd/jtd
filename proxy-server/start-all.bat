@echo off
title JTD Mail AI

:: ---- paths ----
set PROXY_DIR=%~dp0
set ADDIN_DIR=%~dp0..\outlook-addin

echo.
echo  ========================================
echo   JTD Mail AI - Starting...
echo  ========================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

:: Install proxy deps if needed
if not exist "%PROXY_DIR%node_modules" (
    echo  Installing proxy dependencies...
    cd /d "%PROXY_DIR%"
    call npm install
    echo.
)

:: Install addin deps if needed
if not exist "%ADDIN_DIR%\node_modules" (
    echo  Installing addin dependencies...
    cd /d "%ADDIN_DIR%"
    call npm install
    echo.
)

:: Start proxy in separate window
echo  Starting proxy server (port 3000)...
start "JTD Proxy" cmd /k "cd /d "%PROXY_DIR%" && node index.js"

:: Wait a moment for proxy to start
timeout /t 2 /nobreak >nul

:: Start addin dev server in separate window
echo  Starting addin (port 3100)...
start "JTD Addin" cmd /k "cd /d "%ADDIN_DIR%" && npm run dev"

echo.
echo  Both started. Two windows opened:
echo    Proxy:  http://localhost:3000/health
echo    Addin:  https://localhost:3100
echo.
echo  You can close THIS window. Keep the other two open.
echo.
pause
