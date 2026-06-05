@echo off
setlocal
cd /d "%~dp0"
echo.
echo BetterPPTX Dodo TEST billing bootstrap
echo Creates/reuses TEST-MODE credits, subscription product, top-up product, and checkout session.
echo It does not touch live Dodo mode.
echo.
node "%~dp0dodo-test-billing-bootstrap.mjs"
echo.
pause
