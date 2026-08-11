@echo off
echo Starting local server...
cd /d "%~dp0dashboard"
python -m http.server 8080