@echo off
rem Double-click to build the Android APK on Windows (see build-apk-windows.ps1 for what you need first)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-apk-windows.ps1" %*
pause
