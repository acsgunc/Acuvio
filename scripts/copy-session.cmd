@echo off
REM Acuvio Copilot session copier — Windows cmd.exe launcher.
REM Thin wrapper around scripts\copy-session.mjs. Copies the latest GitHub
REM Copilot Chat transcript for this workspace into
REM docs\copilot\copilot-session.jsonl. Forwards all arguments.
REM
REM Usage:
REM   scripts\copy-session.cmd                Auto-discover newest transcript
REM   scripts\copy-session.cmd <path.jsonl>   Copy a specific transcript

setlocal
set "SCRIPT_DIR=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Error: Node.js is not installed or not on PATH.
  echo Install it: winget install OpenJS.NodeJS.LTS
  exit /b 1
)

node "%SCRIPT_DIR%copy-session.mjs" %*
