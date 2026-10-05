@echo off
setlocal enabledelayedexpansion
title Envio Turbo - Base Cabedelo V02 para Cloudflare R2
color 0B

echo =========================================================================
echo   🚀 ENVIANDO ORTOFOTO BASE CABEDELO V02 PARA O CLOUDFLARE R2
echo =========================================================================
echo.
echo  Pasta de origem: Ortofoto_Base_Cabedelo_V02 (79.039 tiles WebP)
echo  Destino no R2:   cabedelo_pb/Ortofoto_Base_Cabedelo_V02
echo.
echo  Aguarde o carregamento...
echo.

python -u "%~dp0migrar_supabase_para_r2.py"

echo.
echo =========================================================================
echo  [OK] Processo concluido! Agora a base inteira abrira instantaneamente.
echo =========================================================================
pause
