@echo off
chcp 65001 >nul
echo ============================================
echo   PDF to Email Converter - Windows Build
echo ============================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [Error] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [Error] npm not found. Reinstall Node.js.
    pause
    exit /b 1
)

cd /d "%~dp0"

echo [1/3] Checking dependencies...
if not exist "node_modules" (
    echo       Running npm install...
    call npm install
    if errorlevel 1 goto :installfail
)

echo [2/3] Building Windows executable...
echo       This may take a few minutes...
call npx electron-forge make --platform win32 --arch x64
if errorlevel 1 goto :buildfail

echo.
echo ============================================
echo   Build complete!
echo ============================================
echo.
echo   Output: out\make\
echo     - squirrel.windows\  : Installer (.exe)
echo     - zip\win32\x64\     : Portable ZIP
echo.
pause
exit /b 0

:installfail
echo.
echo [Error] npm install failed
pause
exit /b 1

:buildfail
echo.
echo [Error] Build failed
pause
exit /b 1
