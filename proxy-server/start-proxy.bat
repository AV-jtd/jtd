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

for /f "tokens=*" %%i in ('node --version') do echo  Node.js: %%i
echo.

:: Check .env
if not exist ".env" (
    echo  ERROR: .env file not found!
    echo.
    echo  Create a .env file in this folder with these two lines:
    echo    AI_PROVIDER=openrouter
    echo    OPENROUTER_API_KEY=sk-or-YOUR_KEY_HERE
    echo.
    pause
    exit /b 1
)

echo  Found: .env OK
echo.

:: Install dependencies if needed
if not exist "node_modules" (
    echo  First run - installing dependencies (takes 1-2 min)...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo  ERROR: npm install failed.
        pause
        exit /b 1
    )
    echo.
)

echo  Starting server...
echo  Open in browser to check: http://localhost:3000/health
echo  To stop: close this window.
echo.

node index.js

echo.
echo  ========================================
echo   Server stopped (exit code: %errorlevel%)
echo  ========================================
echo.
pause
