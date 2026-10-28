@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Britny Max - deteniendo
cd /d "%~dp0"

rem ==================================================================
rem  Detiene el servidor de Britny Max iniciado con iniciar-britny-max.bat.
rem  Solo cierra procesos que sean el servidor (vite preview), así un número
rem  de proceso reutilizado por Windows nunca cierra otro programa.
rem ==================================================================

set "PUERTO=4173"

echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ids = @();" ^
  "if (Test-Path 'logs\servidor.pid') { $ids += [int](Get-Content 'logs\servidor.pid' -TotalCount 1) };" ^
  "$ids += @(Get-NetTCPConnection -LocalPort %PUERTO% -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess);" ^
  "$n = 0;" ^
  "foreach ($id in ($ids | Sort-Object -Unique)) {" ^
  "  $p = Get-CimInstance Win32_Process -Filter \"ProcessId = $id\" -ErrorAction SilentlyContinue;" ^
  "  if ($p -and $p.Name -in 'node.exe','cmd.exe' -and $p.CommandLine -match 'vite' -and $p.CommandLine -match 'preview') { taskkill.exe /PID $id /T /F | Out-Null; $n++ }" ^
  "};" ^
  "Remove-Item 'logs\servidor.pid' -ErrorAction SilentlyContinue;" ^
  "if ($n -gt 0) { exit 0 } else { exit 3 }"

if errorlevel 3 (
  echo   Britny Max no estaba en ejecución.
) else (
  echo   [OK] Britny Max se detuvo.
)
echo.
if not defined BRITNY_SIN_NAVEGADOR ping -n 5 127.0.0.1 >nul
exit /b 0
