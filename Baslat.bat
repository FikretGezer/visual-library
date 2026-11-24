@echo off
setlocal EnableExtensions
title Visual Library - Sunucu
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi. Once Kur.bat calistirin.
  pause
  exit /b 1
)
if not exist ".env" (
  echo [HATA] .env yok. Once Kur.bat calistirin.
  pause
  exit /b 1
)

echo.
echo Visual Library - sunucu ^(durdurmak icin bu pencereyi kapatin veya Ctrl+C^)
echo ==========================================================================

:loop
node server.mjs
set "CODE=%ERRORLEVEL%"
if "%CODE%"=="78" (
  echo.
  echo [HATA] Ayar hatasi: yukaridaki mesaja gore .env dosyasini duzeltin, sonra Baslat.bat'i tekrar calistirin.
  echo        ^(SESSION_SECRET, DATABASE_URL, TMDAUTH_* alanlari^)
  pause
  exit /b 78
)
echo.
echo Sunucu durdu ^(kod %CODE%^). 5 sn sonra yeniden baslatiliyor...
timeout /t 5 /nobreak >nul
goto loop
