@echo off
chcp 65001 > nul
echo ==============================================================================
echo [AUDITORIA QA GERAL - SUPERADMIN, ADMIN E USUARIOS]
echo ==============================================================================
echo.
node test_sistema_qa.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Foram encontradas falhas! O commit seria bloqueado.
    echo Corrija as inconsistencias apontadas acima.
    echo.
) else (
    echo.
    echo [SUCESSO] Sistema 100%% auditado e aprovado para producao e commit!
    echo.
)
pause
