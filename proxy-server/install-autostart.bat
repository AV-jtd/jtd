@echo off
title JTD Mail AI - Autostart Setup

set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set BAT_PATH=%~dp0start-all.bat

echo.
echo  ========================================
echo   JTD Mail AI - Autostart Setup
echo  ========================================
echo.

:: Create shortcut in Windows Startup folder
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%TEMP%\shortcut.vbs"
echo sLinkFile = "%STARTUP%\JTD Mail AI.lnk" >> "%TEMP%\shortcut.vbs"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%TEMP%\shortcut.vbs"
echo oLink.TargetPath = "%BAT_PATH%" >> "%TEMP%\shortcut.vbs"
echo oLink.WorkingDirectory = "%~dp0" >> "%TEMP%\shortcut.vbs"
echo oLink.WindowStyle = 1 >> "%TEMP%\shortcut.vbs"
echo oLink.Description = "JTD Mail AI Proxy + Addin" >> "%TEMP%\shortcut.vbs"
echo oLink.Save >> "%TEMP%\shortcut.vbs"
cscript /nologo "%TEMP%\shortcut.vbs"
del "%TEMP%\shortcut.vbs"

if exist "%STARTUP%\JTD Mail AI.lnk" (
    echo  Done! JTD Mail AI will start automatically with Windows.
    echo.
    echo  To remove autostart, delete this file:
    echo  %STARTUP%\JTD Mail AI.lnk
) else (
    echo  ERROR: Could not create shortcut.
    echo  Try running this file as Administrator.
)

echo.
pause
