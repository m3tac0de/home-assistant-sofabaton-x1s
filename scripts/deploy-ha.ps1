# Deploy the integration to the Home Assistant dev instance.
#
#   .\scripts\deploy-ha.ps1              build cards, copy files, restart HA, wait for it
#   .\scripts\deploy-ha.ps1 -SkipBuild   copy + restart only (backend-only change)
#   .\scripts\deploy-ha.ps1 -NoRestart   copy only (e.g. batching several deploys)
#
# The HA API token lives in scripts\.ha-token and the instance URL / deploy
# target in scripts\.ha-config.json (both gitignored; see
# scripts\.ha-config.example.json). After a deploy that touches www/, the
# browser needs a hard refresh (Ctrl+Shift+R) to pick up the new card bundle.

param(
    [switch]$SkipBuild,
    [switch]$NoRestart
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent
$source = Join-Path $repoRoot "custom_components\sofabaton_x1s"
$tokenFile = Join-Path $PSScriptRoot ".ha-token"

$configFile = Join-Path $PSScriptRoot ".ha-config.json"
if (-not (Test-Path $configFile)) {
    throw "Missing $configFile - copy scripts\.ha-config.example.json and fill in your instance."
}
$config = Get-Content $configFile -Raw | ConvertFrom-Json
$target = $config.deploy_target
$baseUrl = $config.base_url
if (-not $target -or -not $baseUrl) {
    throw "$configFile must define deploy_target and base_url."
}

if (-not (Test-Path $target)) {
    throw "Deploy target not reachable: $target (is the Z: network drive mapped?)"
}

if (-not $SkipBuild) {
    Write-Host "== Building frontend bundles =="
    Push-Location $repoRoot
    try {
        npm run build:tools-card
        if ($LASTEXITCODE -ne 0) { throw "build:tools-card failed" }
        npm run build:remote-card
        if ($LASTEXITCODE -ne 0) { throw "build:remote-card failed" }
    } finally {
        Pop-Location
    }
}

Write-Host "== Copying integration to $target =="
# Mirror the component folder; exclude caches and editor droppings.
robocopy $source $target /MIR /R:2 /W:2 /NFL /NDL /NP `
    /XD __pycache__ .mypy_cache node_modules `
    /XF *.pyc *.pyo *.bak | Out-Host
if ($LASTEXITCODE -ge 8) {
    throw "robocopy failed with exit code $LASTEXITCODE"
}
$copied = $LASTEXITCODE  # 0 = nothing changed, 1-7 = files copied/extra removed
if ($copied -eq 0) {
    Write-Host "No file changes detected (deploy target already up to date)."
}

if ($NoRestart) {
    Write-Host "Skipping HA restart (-NoRestart)."
    exit 0
}

if (-not (Test-Path $tokenFile)) {
    throw "Missing $tokenFile - put the long-lived HA access token in it (single line)."
}
$token = (Get-Content $tokenFile -Raw).Trim()
$headers = @{ Authorization = "Bearer $token" }

# /api/ keeps answering while HA is still shutting down, so the only
# trustworthy signal is /api/config "state": wait until it is no longer
# RUNNING (or the socket drops), then until it is RUNNING again.
# Gotcha (2026-09-02): the core silently IGNORES restart requests while it
# is still bootstrapping integrations (state NOT_RUNNING before startup
# completes; a slow platform kept that phase at ~10 minutes). Deploying
# twice in a row therefore needs the first startup to finish first, which
# the pre-check below enforces.
function Get-HaState {
    try {
        $cfgResp = Invoke-RestMethod -Uri "$baseUrl/api/config" -Headers $headers -TimeoutSec 5
        return [string]$cfgResp.state
    } catch {
        return "DOWN"
    }
}

$stateBefore = Get-HaState
if ($stateBefore -ne "RUNNING") {
    throw "HA is not RUNNING (state: $stateBefore) - it is still starting up or shutting down and would ignore the restart request. Files are copied; retry with -SkipBuild once it reports RUNNING."
}

Write-Host "== Restarting Home Assistant =="
Invoke-RestMethod -Method Post -Uri "$baseUrl/api/services/homeassistant/restart" `
    -Headers $headers -ContentType "application/json" | Out-Null
Write-Host "Restart requested; waiting for HA to come back..."

$deadline = (Get-Date).AddSeconds(900)
$downDeadline = (Get-Date).AddSeconds(120)
$wentDown = $false
while ((Get-Date) -lt $downDeadline -and -not $wentDown) {
    $state = Get-HaState
    if ($state -ne "RUNNING") { $wentDown = $true; Write-Host "HA left RUNNING (state: $state)" }
    else { Start-Sleep -Seconds 2 }
}
if (-not $wentDown) {
    throw "HA never left RUNNING within 120s - the restart request was ignored. Check the HA log."
}

$back = $false
while ((Get-Date) -lt $deadline) {
    $state = Get-HaState
    if ($state -eq "RUNNING") { $back = $true; break }
    Start-Sleep -Seconds 3
}

if (-not $back) {
    throw "HA did not reach RUNNING within 900s (last state: $(Get-HaState)) - check $baseUrl manually."
}

# Debug logging comes from the HA configuration.yaml logger block
# (custom_components.sofabaton_x1s + x1proxy at debug). It must be set in
# the config, not via logger.set_level at runtime: the integration's
# hex-logging capture attaches its handler during setup and disables
# propagation unless the loggers are already at debug at that moment.

Write-Host "HA is back up. Hard-refresh the browser (Ctrl+Shift+R) if www/ changed."
exit 0
