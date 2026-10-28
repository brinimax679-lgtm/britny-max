@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Britny Max - iniciando
cd /d "%~dp0"

rem ==================================================================
rem  Inicia Britny Max en segundo plano (sin ventana de consola) y
rem  abre el navegador. Para detenerlo: detener-britny-max.bat
rem ==================================================================

set "PUERTO=4173"
set "URL=http://localhost:%PUERTO%"

echo.
echo   Britny Max - Gestión de inventario
echo   ----------------------------------
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   [X] No se encontró Node.js. Instálalo desde https://nodejs.org y vuelve a intentarlo.
  echo.
  pause
  exit /b 1
)

rem ¿Ya está en ejecución?
curl -s -o nul -m 2 "%URL%/" >nul 2>&1
if not errorlevel 1 (
  echo   [OK] Britny Max ya estaba en ejecución.
  goto abrir
)

if not exist "node_modules\" (
  echo   Instalando dependencias por primera vez, puede tardar unos minutos...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto error_instalacion
)

echo   Preparando la aplicación...
call npm run build --silent >nul 2>"%TEMP%\britny-max-build.log"
if errorlevel 1 goto error_compilacion

if not exist "logs\" mkdir "logs"

rem Inicia el servidor con la ventana oculta mediante WMI: el proceso queda
rem independiente (no se cierra con esta ventana ni hereda su consola).
rem Su número de proceso se guarda para que detener-britny-max.bat lo cierre.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$oculto = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 };" ^
  "$orden = 'cmd.exe /d /c set NO_COLOR=1&& node node_modules\vite\bin\vite.js preview --port %PUERTO% --strictPort --host 1> logs\servidor.log 2> logs\servidor-errores.log';" ^
  "$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $orden; CurrentDirectory = (Get-Location).Path; ProcessStartupInformation = $oculto };" ^
  "if ($r.ReturnValue -ne 0) { exit 1 };" ^
  "Set-Content -Path 'logs\servidor.pid' -Value $r.ProcessId"
if errorlevel 1 goto error_inicio

echo   Iniciando el servidor...
set /a INTENTOS=0
:esperar
ping -n 2 127.0.0.1 >nul
curl -s -o nul -m 2 "%URL%/" >nul 2>&1
if not errorlevel 1 goto listo
set /a INTENTOS+=1
if %INTENTOS% lss 30 goto esperar
goto error_inicio

:listo
echo   [OK] Britny Max está en ejecución en segundo plano.
rem Espera a que el servidor escriba sus direcciones (para mostrar la del celular).
for /l %%i in (1,1,5) do (
  findstr /c:"Network:" "logs\servidor.log" >nul 2>&1 || ping -n 2 127.0.0.1 >nul
)

:abrir
echo.
echo   En este computador:  %URL%
for /f "tokens=2,*" %%a in ('findstr /c:"Network:" "logs\servidor.log" 2^>nul') do echo   Desde el celular:    %%b
echo.
echo   Para detenerlo, ejecuta detener-britny-max.bat
echo.
if not defined BRITNY_SIN_NAVEGADOR start "" "%URL%"
ping -n 9 127.0.0.1 >nul
exit /b 0

:error_instalacion
echo.
echo   [X] No se pudieron instalar las dependencias. Revisa tu conexión a internet.
echo.
pause
exit /b 1

:error_compilacion
echo.
echo   [X] La aplicación no se pudo compilar:
type "%TEMP%\britny-max-build.log"
echo.
pause
exit /b 1

:error_inicio
echo.
echo   [X] El servidor no respondió. Detalle del error:
if exist "logs\servidor-errores.log" type "logs\servidor-errores.log"
echo.
echo   Si el puerto %PUERTO% está ocupado, ejecuta detener-britny-max.bat y vuelve a intentarlo.
echo.
pause
exit /b 1
