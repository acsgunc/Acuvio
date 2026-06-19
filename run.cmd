@echo off
REM Acuvio — one-click launcher for Windows.
REM Double-click this file (or run it from a terminal) to start the app.
REM It installs dependencies on first run, then opens the desktop window.
REM
REM Optional: run.cmd --build   (production bundle)
REM           run.cmd --web     (UI only, no Rust backend)

setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed or not on PATH.
  echo   Install it from https://nodejs.org and re-run this file.
  echo.
  pause
  exit /b 1
)

node "scripts\run.mjs" %*
set "EXIT=%ERRORLEVEL%"

if not "%EXIT%"=="0" (
  echo.
  echo   Acuvio exited with code %EXIT%.
  pause
)
exit /b %EXIT%
