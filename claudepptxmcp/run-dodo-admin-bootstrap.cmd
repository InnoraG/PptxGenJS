@echo off
setlocal
cd /d "%~dp0"
echo.
echo BetterPPTX Dodo admin bootstrap
echo This uses the private API key saved by setup-dodo-local.ps1.
echo It creates/reuses Dodo test records, saves a local test activation key, and verifies BetterPPTX activation.
echo.
node "%~dp0dodo-admin-bootstrap.mjs"
echo.
if errorlevel 1 (
  echo Dodo bootstrap failed. Leave this window open and share only the non-secret error text.
) else (
  echo Dodo bootstrap completed successfully.
)
pause
