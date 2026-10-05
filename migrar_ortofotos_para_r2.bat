@echo off
setlocal enabledelayedexpansion
title Migracao Turbo de Ortofotos para Cloudflare R2

echo =========================================================================
echo   🚀 MIGRACAO DE ORTOFOTOS: SUPABASE STORAGE -^> CLOUDFLARE R2
echo =========================================================================
echo.

python "%~dp0migrar_supabase_para_r2.py"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [-] Ocorreu um erro durante a migracao.
) else (
    echo.
    echo [OK] Processo de migracao concluido com sucesso!
)

echo.
pause
