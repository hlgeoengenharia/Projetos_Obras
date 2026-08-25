@echo off
setlocal enabledelayedexpansion
title Processador Turbo de Ortofotos (Multi-Core)

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
    echo [-] Erro: QGIS / OSGeo4W nao foi encontrado neste computador.
    echo.
    echo Para que este processador funcione, o computador precisa ter o QGIS instalado.
    echo Baixe gratuitamente em: https://qgis.org
    echo.
    pause
    exit /b 1
)

call "%QGIS_ENV%" >nul 2>&1

python "%~dp0processar_ortofoto.py" %*

pause
