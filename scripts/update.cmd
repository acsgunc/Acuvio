@echo off
REM Acuvio dependency updater — Windows cmd.exe launcher.
REM Thin wrapper around scripts\update-deps.mjs. Forwards all arguments.
REM
REM Usage:
REM   scripts\update.cmd            Safe minor/patch updates
REM   scripts\update.cmd --check    Preview outdated dependencies
REM   scripts\update.cmd --latest   Bump to newest majors

setlocal
set "SCRIPT_DIR=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Error: Node.js is not installed or not on PATH.
  echo Install it: winget install OpenJS.NodeJS.LTS
  exit /b 1
)

node "%SCRIPT_DIR%update-deps.mjs" %*
exit /b %ERRORLEVEL%
