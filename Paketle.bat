@echo off
setlocal EnableExtensions
title Visual Library - Paketle
cd /d "%~dp0"

rem Sunucuya ilk kurulum icin kucuk zip uretir: paketler\VisualLibrary_tarih_saat.zip
rem Haric: .git, .env, paketler, tests, docs, node_modules
if not exist "paketler" mkdir "paketler"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$skip='.git','.env','paketler','tests','docs','node_modules','.superpowers';" ^
  "$items=Get-ChildItem -Force | Where-Object { $skip -notcontains $_.Name } | ForEach-Object { $_.FullName };" ^
  "$zip=Join-Path (Join-Path (Get-Location) 'paketler') ('VisualLibrary_'+(Get-Date -Format 'yyyy-MM-dd_HH-mm')+'.zip');" ^
  "Compress-Archive -LiteralPath $items -DestinationPath $zip -Force;" ^
  "Write-Host ('Paket hazir: '+$zip)"
if errorlevel 1 (
  echo [HATA] Paketleme basarisiz.
  pause
  exit /b 1
)
echo.
echo Zip'i sunucuya kopyalayip acin, sonra Kur.bat calistirin.
pause
