@echo off
title Servidor Local - GeoObras
echo ========================================================
echo Iniciando servidor web local em http://localhost:8080...
echo ========================================================

:: Libera a porta 8080 caso tenha ficado algum processo anterior aberto
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

python -m http.server 8080 --bind 127.0.0.1
pause