@echo off
setlocal enabledelayedexpansion
title Upload Turbo de Ortofotos (Multi-Thread)

echo =========================================================================
echo   🚀 UPLOAD TURBO DE ORTOFOTOS PARA O SUPABASE STORAGE (MULTI-THREAD)
echo =========================================================================
echo.

REM Detecta instalacao do Python do QGIS ou Python Global
set "PYTHON_EXE=python"
for /d %%G in ("C:\Program Files\QGIS*") do (
    if exist "%%G\bin\python.exe" set "PYTHON_EXE=%%G\bin\python.exe"
)

"%PYTHON_EXE%" "%~dp0upload_ortofoto_turbo.py" %*

pause
