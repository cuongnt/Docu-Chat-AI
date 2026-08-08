@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul

echo ============================================================
echo   DocChat AI - Script tự động build file .exe
echo ============================================================
echo.

:: Kiểm tra Node.js
node --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] Chua cai Node.js. Vui long tai tai: https://nodejs.org
    echo       Chon phien ban LTS, cai xong chay lai script nay.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VERSION=%%v
echo [OK] Node.js %NODE_VERSION%

:: Kiểm tra pnpm
pnpm --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Dang cai pnpm...
    npm install -g pnpm
    if %errorlevel% neq 0 (
        echo [LOI] Khong the cai pnpm. Chay: npm install -g pnpm
        pause
        exit /b 1
    )
)
for /f "tokens=*" %%v in ('pnpm --version') do set PNPM_VERSION=%%v
echo [OK] pnpm %PNPM_VERSION%

:: Kiểm tra electron-builder
echo.
echo [INFO] Kiem tra electron-builder...
call pnpm exec electron-builder --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Cai electron-builder qua pnpm...
    call pnpm add -g electron-builder
    if %errorlevel% neq 0 (
        echo [LOI] Khong the cai electron-builder. Chay: pnpm add -g electron-builder
        pause
        exit /b 1
    )
)
echo [OK] electron-builder san sang

:: Di chuyen ve thu muc goc project
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"
cd ..\..
set ROOT_DIR=%CD%
echo.
echo [INFO] Thu muc goc: %ROOT_DIR%

:: Cai dependencies
echo.
echo [BUOC 1/4] Cai dat thu vien (co the mat 5-10 phut lan dau)...
call pnpm install
if %errorlevel% neq 0 (
    echo [LOI] Cai dat that bai. Kiem tra ket noi mang.
    pause
    exit /b 1
)
echo [OK] Cai dat hoan tat

:: Rebuild native modules cho Electron
echo.
echo [BUOC 2/4] Bien dich native modules cho Electron...
cd artifacts\local-rag
call npx electron-rebuild -f -w better-sqlite3 -w node-llama-cpp 2>&1
if %errorlevel% neq 0 (
    echo [CANH BAO] electron-rebuild gap loi (co the bo qua neu da co Visual Studio Build Tools)
)
echo [OK] Native modules san sang

:: Build source code
echo.
echo [BUOC 3/4] Build source code...
call pnpm build
if %errorlevel% neq 0 (
    echo [LOI] Build that bai. Kiem tra TypeScript errors.
    pause
    exit /b 1
)
echo [OK] Build hoan tat

:: Dong goi thanh .exe
echo.
echo [BUOC 4/4] Dong goi thanh file .exe...
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo [LOI] Dong goi that bai.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   HOAN THANH! File cai dat nam tai:
echo   %ROOT_DIR%\artifacts\local-rag\release\
echo ============================================================
echo.
echo Mo thu muc release...
explorer "%ROOT_DIR%\artifacts\local-rag\release"
pause
