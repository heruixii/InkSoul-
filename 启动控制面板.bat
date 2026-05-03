@echo off
title InkSoul / 墨魂 Control Panel

echo.
echo ========================================
echo    InkSoul / 墨魂 Control Panel
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Node.js is installed
echo.

REM Check if root dependencies are installed
if not exist "node_modules\" (
    echo First run detected
    echo.
    echo Installing root dependencies...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: Failed to install root dependencies
        echo.
        echo Please run manually: npm install
        echo.
        pause
        exit /b 1
    )
    echo.
    echo Root dependencies installed successfully
    echo.
)

REM Check if express is specifically installed
if not exist "node_modules\express\" (
    echo Express module not found
    echo.
    echo Installing express...
    echo.
    call npm install express
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: Failed to install express
        echo.
        echo Please run manually: npm install express
        echo.
        pause
        exit /b 1
    )
    echo.
    echo Express installed successfully
    echo.
)

REM Check if server dependencies are installed
if not exist "server\node_modules\" (
    echo Installing server dependencies...
    echo.
    cd server
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: Failed to install server dependencies
        echo.
        cd ..
        echo Please run manually: cd server ^&^& npm install
        echo.
        pause
        exit /b 1
    )
    cd ..
    echo.
    echo Server dependencies installed successfully
    echo.
)

REM Start panel server
echo Starting control panel...
echo.

node panel-server.js

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to start panel
    pause
    exit /b 1
)

pause
