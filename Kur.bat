@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Visual Library - Kurulum
cd /d "%~dp0"

rem Sunucu kurulumu. Tekrar calistirilabilir; .env korunur.
echo.
echo ============================================================
echo   Visual Library - sunucu kurulumu
echo   Klasor: %CD%
echo ============================================================
echo.

rem --- 1) Node.js 22+ ---
where node >nul 2>&1
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi. Node 22 LTS kurun: https://nodejs.org/
  pause
  exit /b 1
)
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%v"
if !NODE_MAJOR! LSS 22 (
  echo [HATA] Node 22 veya uzeri gerekli. Kurulu surum:
  node -v
  pause
  exit /b 1
)
echo [OK] Node.js
node -v

rem --- 2) Ortam dosyasi ---
if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
  echo [UYARI] .env olusturuldu ^(.env.example kopyasi^).
  echo         Simdi acilacak: portu, SESSION_SECRET, DATABASE_URL ve TMDAUTH_* alanlarini doldurun,
  echo         kaydedip kapatin; kurulum devam edecek.
  notepad ".env"
  echo.
)

rem --- 3) Bagimliliklar ---
if exist "package.json" (
  echo Bagimliliklar kuruluyor ^(internet gerekir^)...
  call npm install --omit=dev
  if errorlevel 1 (
    echo [HATA] npm install basarisiz. Internet / proxy erisimini kontrol edin.
    pause
    exit /b 1
  )
  echo [OK] Bagimliliklar
)

rem --- 4) Guvenlik duvari (yonetici gerekir) ---
set "PORT=4099"
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /B /I "PORT=" ".env" 2^>nul`) do (
  for /f "tokens=1 delims= #" %%p in ("%%b") do set "PORT=%%p"
)
echo Guvenlik duvari: TCP !PORT! ...
net session >nul 2>&1
if errorlevel 1 (
  echo [UYARI] Yonetici olarak calistirilmadi; port acilamadi.
  echo         Kur.bat'i sag tik ^> "Yonetici olarak calistir" ile bir kez daha calistirin
  echo         ya da: netsh advfirewall firewall add rule name="Visual Library" dir=in action=allow protocol=TCP localport=!PORT!
) else (
  netsh advfirewall firewall delete rule name="Visual Library" >nul 2>&1
  netsh advfirewall firewall add rule name="Visual Library" dir=in action=allow protocol=TCP localport=!PORT! >nul
  if errorlevel 1 (echo [UYARI] Guvenlik duvari kurali eklenemedi.) else (echo [OK] TCP !PORT! acildi.)
)

echo.
echo ============================================================
echo   Kurulum tamamlandi.
echo   Baslatmak icin: Baslat.bat
echo   Erisim: http://SUNUCU-IP:!PORT!  ^(domain gelince .env PUBLIC_URL^)
echo   Elle guncelleme: Guncelle.bat
echo ============================================================
echo.
set /p START="Simdi baslatilsin mi? (E/H): "
if /I "!START!"=="E" call "%~dp0Baslat.bat"
exit /b 0
