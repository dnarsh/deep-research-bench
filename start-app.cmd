@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 run_app.py --port 8765 --preload-connectome
) else (
  python run_app.py --port 8765 --preload-connectome
)
if errorlevel 1 pause
