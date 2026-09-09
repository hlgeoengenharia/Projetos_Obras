@echo off
title Servidor Local - GeoObras
echo ========================================================
echo Iniciando servidor web local em http://localhost:8080...
echo ========================================================

:: Garante que nenhum processo anterior fique travando a porta 8080
powershell -NoProfile -Command "Get-Process -Id (Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"

:: Abre o navegador automaticamente apos 1 segundo em segundo plano
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:8080"

:: Inicia o servidor Python
python -m http.server 8080 --bind 127.0.0.1
pause