@echo off
title SmartAttend - Public WhatsApp Link Generator
cd /d "%~dp0"
echo ========================================================
echo   SmartAttend - Generating Public HTTPS Link for WhatsApp
echo ========================================================
echo.
echo Make sure 1_start_server.bat is running in the background!
echo.
npx -y localtunnel --port 5173
pause
