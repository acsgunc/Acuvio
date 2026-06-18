<#
.SYNOPSIS
    Acuvio dependency updater — Windows launcher.

.DESCRIPTION
    Thin wrapper around scripts/update-deps.mjs (the real cross-platform logic
    lives there). Checks for Node and Rust, then forwards all arguments.

.EXAMPLE
    .\scripts\update.ps1
    Safe minor/patch updates.

.EXAMPLE
    .\scripts\update.ps1 --check
    Preview what is outdated without changing anything.

.EXAMPLE
    .\scripts\update.ps1 --latest
    Bump to newest major versions (may include breaking changes).

.NOTES
    If script execution is blocked, run once:
        Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
#>

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Set-Location $RootDir

# --- Node.js (required) ---
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'Error: Node.js is not installed or not on PATH.' -ForegroundColor Red
    Write-Host 'Install it (>= 22.22 / 24.15 / 26):'
    Write-Host '  winget install OpenJS.NodeJS.LTS'
    Write-Host '  or download from https://nodejs.org'
    exit 1
}

# --- Rust (optional but recommended; needed for the Tauri backend) ---
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "Warning: cargo (Rust) not found. The Rust backend won't be updated/verified." -ForegroundColor Yellow
    Write-Host '  Install via: winget install Rustlang.Rustup'
}
else {
    & cargo upgrade --help *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Tip: 'cargo install cargo-edit' enables major-version Rust upgrades with --latest." -ForegroundColor DarkGray
    }
}

# Forward all arguments to the cross-platform Node script.
& node (Join-Path $ScriptDir 'update-deps.mjs') @args
exit $LASTEXITCODE
