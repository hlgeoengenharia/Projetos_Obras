@echo off
chcp 65001 > nul
echo ==============================================================================
echo [ESCUDO DE QUALIDADE GEOGESTOR - AUDITORIA COMPLETA PRE-COMMIT / PRE-DEPLOY]
echo ==============================================================================
echo.

echo [1/3] Verificando integridade de sintaxe dos scripts principais...
node -c src/main.js
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha de sintaxe em src/main.js & goto :falha )
node -c src/measurement.js
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha de sintaxe em src/measurement.js & goto :falha )
node -c src/swipe-comparator.js
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha de sintaxe em src/swipe-comparator.js & goto :falha )
node -c src/eventsEngine.js
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha de sintaxe em src/eventsEngine.js & goto :falha )
node -c src/formRenderer.js
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha de sintaxe em src/formRenderer.js & goto :falha )
node -c src/reportMap.js
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha de sintaxe em src/reportMap.js & goto :falha )
echo       OK: Todos os scripts com sintaxe 100%% valida!
echo.

echo [2/3] Executando bateria de testes unitarios e de isolamento de ferramentas...
cmd /c "node --test tests/*.test.js"
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Testes unitarios falharam! & goto :falha )
echo.

echo [3/3] Executando auditoria geral do sistema (210+ verificacoes de integridade)...
node test_sistema_qa.js
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Auditoria QA apontou inconsistencias! & goto :falha )
echo.

echo ==============================================================================
echo [SUCESSO TOTAL] Sistema 100%% blindado e aprovado para producao e commit!
echo ==============================================================================
echo.
pause
exit /b 0

:falha
echo.
echo ==============================================================================
echo [BLOQUEIO DE SEGURANCA] Foram encontradas falhas! O commit / deploy foi cancelado.
echo Corrija as inconsistencias apontadas acima antes de prosseguir.
echo ==============================================================================
echo.
pause
exit /b 1
