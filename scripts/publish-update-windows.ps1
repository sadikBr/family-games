<#
  Keep this file plain ASCII (Windows PowerShell 5.1 reads it in the ANSI code page).

  Publish an over-the-air update of the app (EAS Update, channel "preview"): the phones download it
  the next time the app is opened, no new APK needed. Use it for changes to screens, games, texts,
  sounds and pictures.

  A NEW APK is still needed (scripts\build-apk-windows.cmd) when the native side changes: a new native
  package in package.json, app.json plugins / permissions / icons, eas.json. The update only reaches
  APKs with the same "runtime version" (a fingerprint of the native side), so a mismatch is safe: the
  phones just don't take it. Build the APKs and publish the updates from the SAME computer: the APK
  script writes its runtime version to .apk-runtime, and this script warns when an update won't match.

  The server changes still go to Railway: bunx @railway/cli up --service family-games

  Run from the project folder:
    scripts\publish-update-windows.cmd                      (message: the date and the commit id)
    scripts\publish-update-windows.cmd -Message "Ronda fix"
#>
param(
  [string]$Message = ''
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host ''; Write-Host "ERROR: $text" -ForegroundColor Red; exit 1 }

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) { Fail 'Install Bun (https://bun.sh) first.' }
# Node is needed by the Expo tools: use the portable copy the APK script put in C:\Android if there is one
if (-not (Get-Command node -ErrorAction SilentlyContinue) -and (Test-Path 'C:\Android')) {
  $nodeDir = Get-ChildItem 'C:\Android' -Directory -Filter 'node*' -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'node.exe') } | Select-Object -First 1
  if ($nodeDir) { $env:Path = "$($nodeDir.FullName);$env:Path" }
}

Step 'Installing JavaScript dependencies'
bun install
if ($LASTEXITCODE -ne 0) { Fail 'bun install failed.' }

Step 'Checking the Expo account'
& bunx eas-cli whoami 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Sign in to the Expo account the app belongs to (once on this computer):'
  & bunx eas-cli login
  if ($LASTEXITCODE -ne 0) { Fail 'Expo sign-in failed.' }
}

# the same settings as the APK: the deployed server's address
if (-not $env:EXPO_PUBLIC_SERVER_URL) {
  $eas = Get-Content (Join-Path $root 'eas.json') -Raw | ConvertFrom-Json
  $env:EXPO_PUBLIC_SERVER_URL = $eas.build.preview.env.EXPO_PUBLIC_SERVER_URL
}
$env:NODE_ENV = 'production'
Write-Host "Server: $env:EXPO_PUBLIC_SERVER_URL"

# The default message stays plain ASCII: commit titles are often Arabic, which Windows PowerShell 5.1
# garbles when passing it on (the garbled text then splits into several arguments).
if (-not $Message) {
  $commit = (& git rev-parse --short HEAD 2>$null | Out-String).Trim()
  $Message = "update-$(Get-Date -Format 'yyyy-MM-dd-HHmm')-$commit".Trim('-')
}
# bunx on Windows splits a quoted argument at its spaces: keep the message to one plain word
$Message = ($Message -replace '[^A-Za-z0-9._:-]+', '-').Trim('-')
if (-not $Message) { $Message = "update-$(Get-Date -Format 'yyyy-MM-dd-HHmm')" }

# Will the update reach the phones? Only if its runtime version is the one of the last APK built here.
Step 'Checking the runtime version'
$rvOut = & bunx expo-updates runtimeversion:resolve --platform android --workflow managed 2>$null | Out-String
$runtime = ''
if ($rvOut -match '"runtimeVersion":"([^"]+)"') { $runtime = $Matches[1] }
$apkFile = Join-Path $root '.apk-runtime'
$apkRuntime = ''
if (Test-Path $apkFile) { $apkRuntime = (Get-Content $apkFile -Raw).Trim() }
Write-Host "This update:      $runtime"
if ($apkRuntime) { Write-Host "Last APK built:   $apkRuntime" } else { Write-Host 'Last APK built:   unknown (built before this check existed)' }
if ($runtime -and $apkRuntime -and $runtime -ne $apkRuntime) {
  Write-Host ''
  Write-Host 'WARNING: the runtime versions differ, so phones with the last APK will NOT get this update.' -ForegroundColor Red
  Write-Host 'Something native changed since that APK (package.json, app.json, eas.json, plugins).' -ForegroundColor Red
  Write-Host 'Build and install a new APK first: scripts\build-apk-windows.cmd' -ForegroundColor Red
  $answer = Read-Host 'Publish anyway? (y/N)'
  if ($answer -notmatch '^[yY]') { Fail 'Cancelled.' }
}

Step "Publishing the update ($Message)"
# --environment: EAS requires it in non-interactive mode (the server address is set above anyway)
& bunx eas-cli update --channel preview --platform android --environment preview "--message=$Message" --non-interactive
if ($LASTEXITCODE -ne 0) { Fail 'eas update failed (see the messages above).' }

Write-Host ''
Write-Host 'Done. The phones get it the next time the app is opened (a banner on the home screen offers to restart right away).' -ForegroundColor Green
