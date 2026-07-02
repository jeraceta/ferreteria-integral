@echo off
:: Script para salvar cambios en GitHub - Sistema Ferreteria
chcp 65001 > nul
title Salvar Cambios en GitHub - Sistema Ferreteria

echo ====================================================
echo      SALVAR CAMBIOS EN GITHUB - SISTEMA FERRETERIA
echo ====================================================
echo.

:: Mostrar el estado actual de Git
echo [1] Verificando el estado de los archivos modificados...
echo ----------------------------------------------------
git status
echo ----------------------------------------------------
echo.

:: Confirmar si desea proceder
set /p CONFIRM="¿Desea registrar y subir estos cambios a GitHub? (S/N): "
if /i "%CONFIRM%" neq "S" (
    echo.
    echo Operación cancelada por el usuario.
    goto end
)

echo.
:: Solicitar mensaje de commit
echo Ingrese el mensaje para los cambios (Presione ENTER para usar el predeterminado):
set /p COMMIT_MSG="> "

if "%COMMIT_MSG%"=="" (
    set COMMIT_MSG=Release v1.0.0 - Version final del Sistema de Ferreteria con facturacion, fletes, presupuestos, gestion de usuarios y optimizaciones de UI/UX
)

echo.
echo [2] Agregando archivos a Git...
git add .
if %ERRORLEVEL% neq 0 (
    echo Ocurrió un error al agregar los archivos.
    goto end
)

echo.
echo [3] Creando el commit...
git commit -m "%COMMIT_MSG%"
if %ERRORLEVEL% neq 0 (
    echo Ocurrió un error al crear el commit.
    goto end
)

echo.
echo [4] Subiendo los cambios a GitHub...
git push
if %ERRORLEVEL% neq 0 (
    echo Ocurrió un error al subir los cambios a GitHub.
    echo Por favor, verifique su conexion o credenciales.
    goto end
)

echo.
echo ====================================================
echo  ¡EXITO! Los cambios han sido subidos correctamente.
echo ====================================================

:end
echo.
echo Presione cualquier tecla para salir...
pause > nul
