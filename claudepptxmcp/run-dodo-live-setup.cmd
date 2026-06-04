@echo off
setlocal
cd /d "%~dp0"
echo.
echo BetterPPTX Dodo LIVE setup
echo This window must stay open. The setup may open Dodo pages in your browser.
echo After the browser opens, come back to this window and follow the prompts.
echo Paste the LIVE Dodo API key only in this window, never in chat.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0setup-dodo-local.ps1" -DodoEnvironment Live
