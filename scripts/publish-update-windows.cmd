@echo off
rem Publish an over-the-air app update (see publish-update-windows.ps1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-update-windows.ps1" %*
pause
