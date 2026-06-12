@echo off
title JTD Proxy Server

echo.
echo  ========================================
echo   JTD Mail AI - Proxy Server
echo  ========================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js not found!
    echo.
    echo  Please install Node.js from: https://nodejs.org
    echo  Choose LTS version, run installer, then restart this file.
    echo.
    pause
    exit /b 1
)

:: Check .env
if not exist ".env" (
    echo  ERROR: .env file not found!
    echo.
    echo  Create a .env file next to this bat file with these contents:
    echo.
    echo    AI_PROVIDER=openrouter
    echo    OPENROUTER_API_KEY=sk-or-YOUR_KEY_HERE
    echo.
    echo  See .env.example for more options.
    echo.
    pause
    exit /b 1
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo  First run - installing dependencies...
    call npm install
    echo.
)

echo  Starting server...
echo  Check status at: http://localhost:3000/health
echo  Close this window to stop.
echo.

node index.js

echo.
echo  Server stopped.
pause
