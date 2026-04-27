@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%" || exit /b 1

where pnpm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] pnpm not found in PATH.
    exit /b 1
)

echo [INFO] Building Tauri app ^(exe only, no installer^)...
call pnpm tauri build --no-bundle
if errorlevel 1 (
    echo [ERROR] Build failed.
    exit /b 1
)

set "EXE_DIR=%ROOT%src-tauri\target\release"
set "EXE_PATH="
for %%F in ("%EXE_DIR%\*.exe") do (
    set "EXE_PATH=%%~fF"
    goto :found
)

:found
if not defined EXE_PATH (
    echo [WARN] Build succeeded but no exe found in "%EXE_DIR%".
    exit /b 0
)

echo [OK] EXE: %EXE_PATH%
exit /b 0
