<#
  Build the Android APK on Windows (EAS local builds don't run on Windows).

  Needs, once:
    - Bun (https://bun.sh) or Node.js
    - JDK 17 unzipped somewhere (default C:\Android\jdk-17)            -> or set JAVA_HOME / -JavaHome
    - Android command-line tools unzipped as <sdk>\cmdline-tools\latest  -> default C:\Android\sdk, or ANDROID_HOME / -AndroidHome
  The script installs the SDK packages it needs (platform 36, build-tools 36, NDK, CMake) and accepts the licences.

  Run from the project folder (keep it in a SHORT path such as C:\fg — long paths break the native build):
    powershell -ExecutionPolicy Bypass -File scripts\build-apk-windows.ps1
  or double-click scripts\build-apk-windows.cmd

  Options:
    -JavaHome C:\path\to\jdk-17     -AndroidHome C:\path\to\sdk
    -AllAbis       build for every CPU type (slower; default: arm64-v8a, which every recent phone uses)
    -SkipInstall   don't run bun/npm install
    -Debug         a debug APK (needs the dev server) instead of a release one
#>
param(
  [string]$JavaHome = '',
  [string]$AndroidHome = '',
  [switch]$AllAbis,
  [switch]$SkipInstall,
  [switch]$Debug
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host ''; Write-Host "ERROR: $text" -ForegroundColor Red; exit 1 }

# --- project path: the React Native native build hits Windows' 260-character path limit in deep folders
if ($root.Length -gt 40) {
  Write-Host "Warning: the project is in a long path ($root)." -ForegroundColor Yellow
  Write-Host '         If the build fails with "path too long" / CMake errors, move it to something like C:\fg' -ForegroundColor Yellow
}
try {
  $lp = Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -ErrorAction Stop
  if ($lp.LongPathsEnabled -ne 1) {
    Write-Host 'Tip: Windows long paths are off. To turn them on (once, as administrator):' -ForegroundColor Yellow
    Write-Host '     New-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force' -ForegroundColor Yellow
  }
} catch {}

# --- JDK 17
Step 'Checking JDK 17'
if (-not $JavaHome) { $JavaHome = $env:JAVA_HOME }
if (-not $JavaHome -or -not (Test-Path (Join-Path $JavaHome 'bin\java.exe'))) {
  if (Test-Path 'C:\Android') {
    $found = Get-ChildItem 'C:\Android' -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { $JavaHome = $found.FullName }
  }
}
if (-not $JavaHome -or -not (Test-Path (Join-Path $JavaHome 'bin\java.exe'))) {
  Fail 'JDK 17 not found. Unzip it to C:\Android\jdk-17 (or pass -JavaHome C:\path\to\jdk-17).'
}
$env:JAVA_HOME = $JavaHome
$env:Path = "$JavaHome\bin;$env:Path"
$javaVersion = (& "$JavaHome\bin\java.exe" -version 2>&1 | Out-String)
if ($javaVersion -notmatch 'version "17') { Fail "JAVA_HOME ($JavaHome) is not JDK 17:`n$javaVersion" }
Write-Host "JDK: $JavaHome"

# --- Android SDK
Step 'Checking the Android SDK'
if (-not $AndroidHome) { $AndroidHome = $env:ANDROID_HOME }
if (-not $AndroidHome) { $AndroidHome = $env:ANDROID_SDK_ROOT }
if (-not $AndroidHome) { $AndroidHome = 'C:\Android\sdk' }
$sdkmanager = Join-Path $AndroidHome 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sdkmanager)) {
  Fail ("Android command-line tools not found at $sdkmanager`n" +
        "Download 'Command line tools only' for Windows from https://developer.android.com/studio#command-line-tools-only,`n" +
        "unzip it, and move the inner 'cmdline-tools' folder so this file exists: $AndroidHome\cmdline-tools\latest\bin\sdkmanager.bat")
}
$env:ANDROID_HOME = $AndroidHome
$env:ANDROID_SDK_ROOT = $AndroidHome
$env:Path = "$AndroidHome\platform-tools;$env:Path"
Write-Host "SDK: $AndroidHome"

Step 'Accepting the Android SDK licences'
$yes = ("y`n" * 30)
$yes | & $sdkmanager --licenses "--sdk_root=$AndroidHome" | Out-Null

Step 'Installing the SDK packages the build needs (first time takes a while)'
& $sdkmanager "--sdk_root=$AndroidHome" 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' 'ndk;27.1.12297006' 'cmake;3.22.1'
if ($LASTEXITCODE -ne 0) { Fail 'sdkmanager could not install the SDK packages.' }

# --- JavaScript dependencies
$useBun = [bool](Get-Command bun -ErrorAction SilentlyContinue)
if (-not $useBun -and -not (Get-Command npx -ErrorAction SilentlyContinue)) { Fail 'Install Bun (https://bun.sh) or Node.js first.' }
if (-not $SkipInstall) {
  Step 'Installing JavaScript dependencies'
  if ($useBun) { bun install } else { npm install }
  if ($LASTEXITCODE -ne 0) { Fail 'Installing dependencies failed.' }
}

# --- the same settings as the EAS "preview" build: the deployed server's address
if (-not $env:EXPO_PUBLIC_SERVER_URL) {
  $eas = Get-Content (Join-Path $root 'eas.json') -Raw | ConvertFrom-Json
  $env:EXPO_PUBLIC_SERVER_URL = $eas.build.preview.env.EXPO_PUBLIC_SERVER_URL
}
Write-Host "Server: $env:EXPO_PUBLIC_SERVER_URL"
$env:NODE_ENV = 'production'

# --- generate the native Android project from app.json (fresh every time)
Step 'Generating the Android project (expo prebuild)'
if ($useBun) { bunx expo prebuild --platform android --clean --no-install } else { npx expo prebuild --platform android --clean --no-install }
if ($LASTEXITCODE -ne 0) { Fail 'expo prebuild failed.' }
Set-Content -Path (Join-Path $root 'android\local.properties') -Value ('sdk.dir=' + ($AndroidHome -replace '\\', '\\')) -Encoding ASCII

# --- build
$task = 'assembleRelease'
$variant = 'release'
if ($Debug) { $task = 'assembleDebug'; $variant = 'debug' }
$abis = 'arm64-v8a'
if ($AllAbis) { $abis = 'armeabi-v7a,arm64-v8a,x86,x86_64' }
Step "Building the APK ($variant, $abis) — 10 to 30 minutes the first time"
Push-Location (Join-Path $root 'android')
try {
  & .\gradlew.bat $task "-PreactNativeArchitectures=$abis"
  if ($LASTEXITCODE -ne 0) { Fail 'The Gradle build failed (see the messages above).' }
} finally {
  Pop-Location
}

$apk = Join-Path $root "android\app\build\outputs\apk\$variant\app-$variant.apk"
if (-not (Test-Path $apk)) { Fail "The build finished but no APK was found at $apk" }
Copy-Item $apk (Join-Path $root 'family-games.apk') -Force
Write-Host ''
Write-Host "Done: $(Join-Path $root 'family-games.apk')" -ForegroundColor Green
Write-Host 'Note: this APK is signed with a local key. If the phone has the APK from GitLab installed, uninstall that first.' -ForegroundColor Yellow
