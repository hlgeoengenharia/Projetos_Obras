@echo off
setlocal enabledelayedexpansion
title Upload Turbo de Ortofotos (WebGIS)

echo =========================================================================
echo   🚀 UPLOAD TURBO DE ORTOFOTOS (SUPABASE STORAGE MULTI-THREAD)
echo   Pre-requisito: QGIS 3.x (64-bits) instalado para os modulos Python/GUI
echo =========================================================================
echo.

REM Detecta qualquer instalacao do QGIS / OSGeo4W no Windows
set "QGIS_ENV="
for /d %%G in ("C:\Program Files\QGIS*") do (
    if exist "%%G\bin\o4w_env.bat" set "QGIS_ENV=%%G\bin\o4w_env.bat"
)
if not defined QGIS_ENV (
    for /d %%G in ("C:\Program Files (x86)\QGIS*") do (
        if exist "%%G\bin\o4w_env.bat" set "QGIS_ENV=%%G\bin\o4w_env.bat"
    )
)
if not defined QGIS_ENV if exist "C:\OSGeo4W\bin\o4w_env.bat" set "QGIS_ENV=C:\OSGeo4W\bin\o4w_env.bat"
if not defined QGIS_ENV if exist "C:\OSGeo4W64\bin\o4w_env.bat" set "QGIS_ENV=C:\OSGeo4W64\bin\o4w_env.bat"

if not defined QGIS_ENV (
    echo [-] ERRO: QGIS / OSGeo4W nao foi encontrado neste computador!
    echo.
    echo 📌 PRE-REQUISITO OBRIGATORIO:
    echo Para que a interface grafica funcione, este computador precisa ter o QGIS instalado.
    echo Download gratuito em: https://qgis.org
    echo.
    pause
    exit /b 1
)

for %%I in ("%QGIS_ENV%") do set "QGIS_BIN=%%~dpI"

set "QGIS_PYTHON="
if exist "%QGIS_BIN%python.exe" set "QGIS_PYTHON=%QGIS_BIN%python.exe"
if not defined QGIS_PYTHON if exist "%QGIS_BIN%python3.exe" set "QGIS_PYTHON=%QGIS_BIN%python3.exe"

call "%QGIS_ENV%" >nul 2>&1

set "SCRIPT_PY="
if exist "%~dp0upload_ortofoto_turbo.py" set "SCRIPT_PY=%~dp0upload_ortofoto_turbo.py"
if not defined SCRIPT_PY if exist "C:\Users\Windows 11\Documents\Projetos\Projeto_V01\Projetos_Obras\upload_ortofoto_turbo.py" (
    set "SCRIPT_PY=C:\Users\Windows 11\Documents\Projetos\Projeto_V01\Projetos_Obras\upload_ortofoto_turbo.py"
)

if not defined SCRIPT_PY (
    echo [-] ERRO: Nao foi possivel encontrar o arquivo 'upload_ortofoto_turbo.py'!
    pause
    exit /b 1
)

if defined QGIS_PYTHON (
    "%QGIS_PYTHON%" "%SCRIPT_PY%" %*
) else (
    python "%SCRIPT_PY%" %*
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [-] Ocorreu um erro ao executar o Upload Turbo.
    pause
)
