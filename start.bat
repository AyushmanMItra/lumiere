@echo off
title Lumiere Theater Server
set LUMIERE_BATCH_RUNNER=1

:server_loop
echo ====================================================
echo        Starting Lumiere Theater Server...
echo ====================================================
node server.js
set SERVER_EXIT=%ERRORLEVEL%

if "%SERVER_EXIT%"=="42" (
    echo.
    echo ====================================================
    echo        Restarting Lumiere Theater Server...
    echo ====================================================
    timeout /t 1 /nobreak >nul
    goto server_loop
)

if "%SERVER_EXIT%"=="0" (
    echo.
    echo [Lumiere Server stopped cleanly]
    goto prompt_action
)

echo.
echo [Lumiere Server stopped with exit code %SERVER_EXIT%]

:prompt_action
echo.
choice /c YNR /n /m "Terminate server or restart (y/n/r)? "
if errorlevel 3 (
    echo Restarting Lumiere Theater Server...
    goto server_loop
)
if errorlevel 2 (
    echo Resuming Lumiere Theater Server...
    goto server_loop
)
if errorlevel 1 (
    echo Exiting Lumiere Theater.
    goto end
)

:end
