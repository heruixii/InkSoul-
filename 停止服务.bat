@echo off
title InkSoul / 墨魂 - 停止服务

echo 正在停止 InkSoul / 墨魂 服务...
echo.

:: 停止 Node.js 进程
taskkill /F /IM node.exe 2>nul

echo [✓] 服务已停止
echo.
pause
