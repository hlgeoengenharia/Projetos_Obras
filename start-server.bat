@echo off
title Servidor Local - GeoObras
echo ========================================================
echo Iniciando servidor web local em http://localhost:8080...
echo ========================================================

:: Garante que nenhum processo anterior fique travando a porta 8080
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080" ^| findstr "LISTENING"') do (
    if not "%%a"=="" if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)

:: Abre o navegador automaticamente apos 1 segundo em segundo plano
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:8080"

:: Inicia o servidor Python com suporte a APIs locais (Resend e arquivos)
python dev_server.py 8080
pause