@echo off
chcp 65001 >nul
title JTD Proxy Server

echo.
echo  ╔══════════════════════════════════════╗
echo  ║       JTD Mail AI — Proxy Server     ║
echo  ╚══════════════════════════════════════╝
echo.

:: Проверяем Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  ✗ Node.js не найден!
    echo.
    echo  Установите Node.js с сайта: https://nodejs.org
    echo  Выберите версию LTS, запустите установщик, перезапустите этот файл.
    echo.
    pause
    exit /b 1
)

:: Проверяем .env
if not exist ".env" (
    echo  ✗ Файл .env не найден!
    echo.
    echo  Создайте файл .env рядом с этим файлом.
    echo  Пример содержимого скопируйте из .env.example
    echo.
    echo  Минимальное содержимое .env:
    echo    AI_PROVIDER=openrouter
    echo    OPENROUTER_API_KEY=sk-or-ВАШ_КЛЮЧ
    echo.
    pause
    exit /b 1
)

:: Устанавливаем зависимости если нужно
if not exist "node_modules" (
    echo  Первый запуск — устанавливаем зависимости...
    call npm install
    echo.
)

echo  Запускаем сервер...
echo  Для проверки откройте в браузере: http://localhost:3000/health
echo  Для остановки закройте это окно.
echo.

node index.js

echo.
echo  Сервер остановлен.
pause
