# Deploy the integration to the Home Assistant dev instance.
#
#   .\scripts\deploy-ha.ps1              build cards, copy files, restart HA, wait for it
#   .\scripts\deploy-ha.ps1 -SkipBuild   copy + restart only (backend-only change)
#   .\scripts\deploy-ha.ps1 -NoRestart   copy only (e.g. batching several deploys)
#
# The HA API token lives in scripts\.ha-token (gitignored). After a deploy
# that touches www/, the browser needs a hard refresh (Ctrl+Shift+R) to pick
# up the new card bundle.

param(
    [switch]$SkipBuild,
    [switch]$NoRestart
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent
$source = Join-Path $repoRoot "custom_components\sofabaton_x1s"
$target = "Z:\path\to\custom_components\sofabaton_x1s"
$baseUrl = "https://YOUR-HA-HOST:8123"
$tokenFile = Join-Path $PSScriptRoot ".ha-token"

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

Write-Host "== Restarting Home Assistant =="
Invoke-RestMethod -Method Post -Uri "$baseUrl/api/services/homeassistant/restart" `
    -Headers $headers -ContentType "application/json" | Out-Null
Write-Host "Restart requested; waiting for HA to come back..."

$deadline = (Get-Date).AddSeconds(180)
Start-Sleep -Seconds 10   # give HA time to actually go down before probing
$back = $false
while ((Get-Date) -lt $deadline) {
    try {
        $resp = Invoke-RestMethod -Uri "$baseUrl/api/" -Headers $headers -TimeoutSec 5
        if ($resp.message) { $back = $true; break }
    } catch {
        Start-Sleep -Seconds 3
    }
}

if (-not $back) {
    throw "HA did not respond within 180s - check $baseUrl manually."
}

# Debug logging comes from the HA configuration.yaml logger block
# (custom_components.sofabaton_x1s + x1proxy at debug). It must be set in
# the config, not via logger.set_level at runtime: the integration's
# hex-logging capture attaches its handler during setup and disables
# propagation unless the loggers are already at debug at that moment.

Write-Host "HA is back up. Hard-refresh the browser (Ctrl+Shift+R) if www/ changed."
exit 0
