@echo off
mode con cols=60 lines=24
title 九州修仙录 - 开发模式

echo.
echo   ========================================
echo        九州修仙录 - 开发模式启动中
echo   ========================================
echo.

cd /d %~dp0

echo   [0/3] 设置国内镜像源...
call npm config set registry https://registry.npmmirror.com >nul 2>&1

echo   [1/3] 检查后端依赖...
cd server
if not exist node_modules (
    echo        正在安装后端依赖...
    call npm install >nul 2>&1
)
cd ..

echo   [2/3] 检查前端依赖...
cd client
if not exist node_modules (
    echo        正在安装前端依赖...
    call npm install >nul 2>&1
)
cd ..

echo   [3/3] 启动服务...
echo        启动后端 (6011)...
start /b /min cmd /c "cd server && set PORT=6011 && npm run dev"
timeout /t 2 /nobreak >nul
echo        启动前端 (6010)...
start /b /min cmd /c "cd client && npm run dev -- --port 6010"
timeout /t 3 /nobreak >nul

echo.
echo   ----------------------------------------
echo     前端: http://localhost:6010
echo     后端: http://localhost:6011
echo   ----------------------------------------
echo.
echo   按任意键停止所有服务并退出...
pause >nul

echo   正在停止服务...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :6010 2^>nul') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :6011 2^>nul') do taskkill /f /pid %%a >nul 2>&1
echo   已停止!