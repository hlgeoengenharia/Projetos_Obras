@echo off
setlocal enabledelayedexpansion
title Upload Turbo de Ortofotos (WebGIS)

REM Detecta instalacao do QGIS / OSGeo4W no Windows para carregar o ambiente Python completo
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

if defined QGIS_ENV (
    call "%QGIS_ENV%" >nul 2>&1
    python "%~dp0upload_ortofoto_turbo.py" %*
) else (
    python "%~dp0upload_ortofoto_turbo.py" %*
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [-] Ocorreu uma interrupcao no programa.
    pause
)
