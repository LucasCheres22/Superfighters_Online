@echo off
title Superfighters - iniciar jogo online
cd /d "%~dp0"
echo Iniciando o relay (servidor das partidas)...
start "Relay Superfighters" cmd /k node server.js
timeout /t 3 /nobreak >nul
echo Abrindo o tunel ngrok...
start "ngrok Superfighters" "%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe" http --region sa --domain=risk-quadrant-magnetize.ngrok-free.dev 8787
echo.
echo Pronto. Deixe as duas janelas abertas enquanto jogar.
echo Para encerrar, feche as janelas "Relay Superfighters" e "ngrok Superfighters".
pause
