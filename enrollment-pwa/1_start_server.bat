@echo off
title SmartAttend - Local Server
cd /d "%~dp0"
echo ========================================================
echo   SmartAttend - Starting Local Server
echo ========================================================
node server.js
pause
