@echo off
setlocal
cd /d "%~dp0"
echo.
echo BetterPPTX Dodo LIVE product bootstrap
echo This script is guarded. It will NOT create a live product unless a price is already configured and you run it with --create.
echo.
node "%~dp0dodo-live-product-bootstrap.mjs" %*
echo.
pause
