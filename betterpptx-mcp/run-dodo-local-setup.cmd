@echo off
setlocal
cd /d "%~dp0"
echo.
echo BetterPPTX Dodo setup
echo This window must stay open. The setup may open Dodo pages in your browser.
echo After the browser opens, come back to this window and follow the prompts.
echo You will be asked to choose TEST or LIVE mode.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0setup-dodo-local.ps1"
