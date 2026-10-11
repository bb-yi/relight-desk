@echo off
setlocal
title Relight Desk
pushd "%~dp0"
if errorlevel 1 (
  echo ERROR: Cannot open the Relight Desk folder.
  pause
  exit /b 1
)
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Please install Node.js 24.5 or newer from https://nodejs.org/
  echo Then close this window and double-click start.bat again.
  popd
  pause
  exit /b 1
)
echo Starting Relight Desk. Please keep this window open.
echo First launch may take a few minutes to prepare dependencies and models.
echo Press Ctrl+C to stop the server.
echo.
node.exe "%~dp0start.mjs" %*
set "relightExitCode=%errorlevel%"
popd
if not "%relightExitCode%"=="0" (
  echo.
  echo Relight Desk could not start. See the error above.
  pause
)
exit /b %relightExitCode%
