# Sulala Agent OS — one-line install (Windows PowerShell)
# Usage: iwr -useb https://sulala.ai/install.ps1 | iex
#        & ([scriptblock]::Create((iwr -useb https://sulala.ai/install.ps1))) -Version 0.1.8 -NoOnboard -DryRun
# Or from npm package: & node_modules\@sulala\agent-os\install.ps1
# If npm/sulala show "scripts is disabled", run once: Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

param(
    [string]$Version = "latest",
    [switch]$NoOnboard,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$REPO_NAME = "@sulala/agent-os"
$NODE_MIN_MAJOR = 18
$DASHBOARD_PORT = if ($env:PORT) { $env:PORT } else { "3010" }

# Use npm.cmd to avoid PowerShell execution policy blocking npm.ps1
function Get-NpmCmd {
    $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npmCmd -and $npmCmd.Source) { return $npmCmd.Source }
    $nodeDir = (Get-Command node -ErrorAction SilentlyContinue).Path | Split-Path -Parent
    if ($nodeDir) {
        $npmCmdPath = Join-Path $nodeDir "npm.cmd"
        if (Test-Path $npmCmdPath) { return $npmCmdPath }
    }
    return "npm"
}

Write-Host ""
Write-Host "  Sulala Agent OS Installer" -ForegroundColor Cyan
Write-Host ""

# Require PowerShell 5+
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Host "[!] Error: PowerShell 5+ required" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Windows detected" -ForegroundColor Green

# Allow scripts in this session so npm.ps1/sulala.ps1 work if invoked
$policy = Get-ExecutionPolicy -Scope Process -ErrorAction SilentlyContinue
if ($policy -eq "Restricted" -or $policy -eq "AllSigned") {
    try {
        Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force -ErrorAction Stop
        Write-Host "[OK] Scripts enabled for this session" -ForegroundColor Green
    } catch {
        Write-Host "[!] If npm or sulala fail with 'scripts is disabled', run once:" -ForegroundColor Yellow
        Write-Host "    Set-ExecutionPolicy -Scope CurrentUser RemoteSigned" -ForegroundColor Cyan
    }
}

# Environment overrides
if (-not $PSBoundParameters.ContainsKey("Version")) {
    if (-not [string]::IsNullOrWhiteSpace($env:SULALA_VERSION)) {
        $Version = $env:SULALA_VERSION
    }
}
if (-not $PSBoundParameters.ContainsKey("NoOnboard")) {
    if ($env:SULALA_NO_ONBOARD -eq "1") {
        $NoOnboard = $true
    }
}
if (-not $PSBoundParameters.ContainsKey("DryRun")) {
    if ($env:SULALA_DRY_RUN -eq "1") {
        $DryRun = $true
    }
}

# Check Bun or Node.js (18+)
function Check-Node {
    try {
        $bun = Get-Command bun -ErrorAction SilentlyContinue
        if ($bun) {
            Write-Host "[OK] Bun found" -ForegroundColor Green
            return $true
        }
        $nodeVersion = (node -v 2>$null)
        if ($nodeVersion) {
            $ver = $nodeVersion -replace '^v', ''
            $major = [int]($ver.Split('.')[0])
            if ($major -ge $NODE_MIN_MAJOR) {
                Write-Host "[OK] Node.js $nodeVersion found" -ForegroundColor Green
                return $true
            } else {
                Write-Host "[!] Node.js $nodeVersion found, but v${NODE_MIN_MAJOR}+ required" -ForegroundColor Yellow
                return $false
            }
        }
    } catch {
        Write-Host "[!] Node.js not found" -ForegroundColor Yellow
        return $false
    }
    return $false
}

# Install Node.js via winget, Chocolatey, or Scoop
function Install-Node {
    Write-Host "[*] Installing Node.js..." -ForegroundColor Yellow

    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "  Using winget..." -ForegroundColor Gray
        & winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        $nodePaths = @("$env:ProgramFiles\nodejs", "${env:ProgramFiles(x86)}\nodejs")
        foreach ($p in $nodePaths) {
            if (Test-Path $p) { $env:Path = "$p;$env:Path"; break }
        }
        Write-Host "[OK] Node.js installed via winget" -ForegroundColor Green
        return
    }

    if (Get-Command choco -ErrorAction SilentlyContinue) {
        Write-Host "  Using Chocolatey..." -ForegroundColor Gray
        & choco install nodejs-lts -y
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        Write-Host "[OK] Node.js installed via Chocolatey" -ForegroundColor Green
        return
    }

    if (Get-Command scoop -ErrorAction SilentlyContinue) {
        Write-Host "  Using Scoop..." -ForegroundColor Gray
        & scoop install nodejs-lts
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        Write-Host "[OK] Node.js installed via Scoop" -ForegroundColor Green
        return
    }

    Write-Host ""
    Write-Host "[!] Error: No package manager found (winget, choco, or scoop)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install Node.js ${NODE_MIN_MAJOR}+ manually:" -ForegroundColor Yellow
    Write-Host "  https://nodejs.org/en/download/" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Or install winget (App Installer) from the Microsoft Store." -ForegroundColor Gray
    exit 1
}

function Get-SulalaCommandPath {
    $sulalaCmd = Get-Command sulala.cmd -ErrorAction SilentlyContinue
    if ($sulalaCmd -and $sulalaCmd.Source) {
        return $sulalaCmd.Source
    }
    $sulala = Get-Command sulala -ErrorAction SilentlyContinue
    if ($sulala -and $sulala.Source) {
        return $sulala.Source
    }
    return $null
}

function Get-NpmGlobalBinCandidates {
    param([string]$NpmPrefix)
    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($NpmPrefix)) {
        $candidates += $NpmPrefix
        $candidates += (Join-Path $NpmPrefix "bin")
    }
    if (-not [string]::IsNullOrWhiteSpace($env:APPDATA)) {
        $candidates += (Join-Path $env:APPDATA "npm")
    }
    return $candidates | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
}

function Ensure-SulalaOnPath {
    if (Get-SulalaCommandPath) {
        return $true
    }
    $npmPrefix = $null
    try {
        $npmExe = Get-NpmCmd
        $npmPrefix = (& $npmExe config get prefix 2>$null).Trim()
    } catch {
        $npmPrefix = $null
    }
    $npmBins = Get-NpmGlobalBinCandidates -NpmPrefix $npmPrefix
    foreach ($npmBin in $npmBins) {
        $sulalaCmd = Join-Path $npmBin "sulala.cmd"
        $sulalaExe = Join-Path $npmBin "sulala"
        if (-not (Test-Path $sulalaCmd) -and -not (Test-Path $sulalaExe)) {
            continue
        }
        $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
        if (-not ($userPath -split ";" | Where-Object { $_ -ieq $npmBin })) {
            [Environment]::SetEnvironmentVariable("Path", "$userPath;$npmBin", "User")
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            Write-Host "[!] Added $npmBin to user PATH (restart terminal if command not found)" -ForegroundColor Yellow
        }
        return $true
    }
    Write-Host "[!] sulala is not on PATH yet." -ForegroundColor Yellow
    Write-Host "Restart PowerShell or add the npm global install folder to PATH." -ForegroundColor Yellow
    if ($npmBins.Count -gt 0) {
        Write-Host "Expected path (one of):" -ForegroundColor Gray
        foreach ($b in $npmBins) {
            Write-Host "  $b" -ForegroundColor Cyan
        }
    } else {
        Write-Host "Hint: run \"npm.cmd config get prefix\" (or npm config get prefix) to find your npm global path." -ForegroundColor Gray
    }
    return $false
}

function Invoke-SulalaCommand {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )
    $commandPath = Get-SulalaCommandPath
    if (-not $commandPath) {
        throw "sulala command not found on PATH."
    }
    & $commandPath @Arguments
}

# Install @sulala/agent-os globally
function Install-Sulala {
    if ([string]::IsNullOrWhiteSpace($Version)) {
        $Version = "latest"
    }
    Write-Host "[*] Installing $REPO_NAME (version: $Version)..." -ForegroundColor Yellow
    $prevLogLevel = $env:NPM_CONFIG_LOGLEVEL
    $prevUpdateNotifier = $env:NPM_CONFIG_UPDATE_NOTIFIER
    $prevFund = $env:NPM_CONFIG_FUND
    $prevAudit = $env:NPM_CONFIG_AUDIT
    $prevScriptShell = $env:NPM_CONFIG_SCRIPT_SHELL
    $env:NPM_CONFIG_LOGLEVEL = "error"
    $env:NPM_CONFIG_UPDATE_NOTIFIER = "false"
    $env:NPM_CONFIG_FUND = "false"
    $env:NPM_CONFIG_AUDIT = "false"
    $env:NPM_CONFIG_SCRIPT_SHELL = "cmd.exe"
    try {
        $npmExe = Get-NpmCmd
        $spec = if ($Version -eq "latest") { $REPO_NAME } else { "${REPO_NAME}@${Version}" }
        $npmOutput = & $npmExe install -g $spec 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[!] npm install failed" -ForegroundColor Red
            $npmOutput | ForEach-Object { Write-Host $_ }
            exit 1
        }
    } finally {
        $env:NPM_CONFIG_LOGLEVEL = $prevLogLevel
        $env:NPM_CONFIG_UPDATE_NOTIFIER = $prevUpdateNotifier
        $env:NPM_CONFIG_FUND = $prevFund
        $env:NPM_CONFIG_AUDIT = $prevAudit
        $env:NPM_CONFIG_SCRIPT_SHELL = $prevScriptShell
    }
    Write-Host "[OK] Sulala Agent OS installed" -ForegroundColor Green
}

# Main
function Main {
    if ($DryRun) {
        Write-Host "[OK] Dry run" -ForegroundColor Green
        Write-Host "[OK] Version: $Version" -ForegroundColor Green
        if ($NoOnboard) {
            Write-Host "[OK] Onboard: skipped" -ForegroundColor Green
        }
        return
    }

    # Step 1: Bun or Node.js
    if (-not (Check-Node)) {
        Install-Node
        if (-not (Check-Node)) {
            Write-Host ""
            Write-Host "[!] Node.js may require a terminal restart" -ForegroundColor Red
            Write-Host "Close this window, open a new PowerShell, and run:" -ForegroundColor Yellow
            Write-Host "  iwr -useb https://sulala.ai/install.ps1 | iex" -ForegroundColor Cyan
            exit 1
        }
    }

    # Step 2: Install Sulala Agent OS
    Install-Sulala

    if (-not (Ensure-SulalaOnPath)) {
        Write-Host "Install completed, but sulala is not on PATH yet." -ForegroundColor Yellow
        Write-Host "Open a new terminal, then run: sulala onboard" -ForegroundColor Cyan
        return
    }

    # Step 3: Onboard (start/daemon are macOS/Linux only)
    if ($NoOnboard) {
        Write-Host ""
        Write-Host "Skipping onboard (requested). Run " -NoNewline
        Write-Host "sulala onboard" -ForegroundColor Cyan -NoNewline
        Write-Host " when ready."
        $userPolicy = Get-ExecutionPolicy -Scope CurrentUser -ErrorAction SilentlyContinue
        if ($userPolicy -eq "Restricted") {
            Write-Host ""
            Write-Host "PowerShell tip: If 'npm' or 'sulala' show 'scripts is disabled', run once:" -ForegroundColor Gray
            Write-Host "  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned" -ForegroundColor Cyan
        }
        return
    }

    Write-Host ""
    Write-Host "[*] Setting up Sulala Agent OS (onboard)..." -ForegroundColor Yellow
    Invoke-SulalaCommand onboard
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host ""
    Write-Host "Sulala Agent OS installed." -ForegroundColor Green
    Write-Host "  Dashboard: http://127.0.0.1:$DASHBOARD_PORT"
    Write-Host "  View login token: sulala dashboard-token"
    Write-Host "  CLI: sulala run <agent_id> <task> | sulala start | sulala stop"
    Write-Host "  (start/stop daemon is supported on macOS/Linux only)"
    Write-Host ""
    $userPolicy = Get-ExecutionPolicy -Scope CurrentUser -ErrorAction SilentlyContinue
    if ($userPolicy -eq "Restricted") {
        Write-Host "PowerShell tip: To run 'npm' or 'sulala' in new windows without errors, run once:" -ForegroundColor Gray
        Write-Host "  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned" -ForegroundColor Cyan
        Write-Host ""
    }
}

Main
