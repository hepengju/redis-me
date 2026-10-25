@echo off
rem ==========================================================================
rem RedisME Redisson custom-codec one-shot setup (Windows)
rem
rem Moving to another machine / onboarding a teammate, just two steps:
rem   1. In your Java project root, run:
rem        <extracted>\redisson\setup.cmd --collect --with-classes
rem      Gathers dependency jars into <package>\lib and business classes into
rem      <package>\lib\classes
rem   2. Then install (copies everything to a fixed directory and prints the
rem      command line to paste):
rem        <extracted>\redisson\setup.cmd --install
rem
rem Options:
rem   --collect         run mvn in the CURRENT dir, collect jars into lib\
rem   --with-classes    mvn compile, then copy target\classes into lib\classes\
rem   --install         install package contents to the fixed directory
rem   --dest <dir>      override install dir (default %USERPROFILE%\redis\custom\redisson)
rem
rem Note: mvn always runs in the directory you invoke this from (your project
rem       root). lib\ and the jar live next to this script, resolved absolutely,
rem       so you can call the script from anywhere.
rem
rem Convention: use the SAME install dir on every machine, so the command path
rem               in RedisME settings never changes. Paste once, done.
rem ==========================================================================

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "LIBDIR=%SCRIPT_DIR%\lib"
set "DEFAULT_DEST=%USERPROFILE%\redis\custom\redisson"
set "DEST="
set "DO_COLLECT="
set "DO_CLASSES="
set "DO_INSTALL="

:parse
if "%~1"=="" goto parsed
if /i "%~1"=="--collect"      ( set "DO_COLLECT=1" & shift & goto parse )
if /i "%~1"=="--with-classes" ( set "DO_CLASSES=1" & shift & goto parse )
if /i "%~1"=="--install"      ( set "DO_INSTALL=1" & shift & goto parse )
if /i "%~1"=="--dest"         ( set "DEST=%~2" & shift & shift & goto parse )
if /i "%~1"=="-h"             goto usage
if /i "%~1"=="--help"         goto usage
echo [setup] unknown option: %~1  (setup.cmd --help)
exit /b 2

:parsed
if not defined DEST set "DEST=%DEFAULT_DEST%"
if defined DO_COLLECT  goto do_collect
if defined DO_INSTALL  goto do_install
echo [setup] nothing to do. Typical: setup.cmd --collect --with-classes ^&^& setup.cmd --install
goto usage

rem ===================== 1. collect dependency jars =========================
:do_collect
where mvn >nul 2>&1
if errorlevel 1 (
    echo [setup] mvn not found. Install Maven and add it to PATH, then retry.
    exit /b 1
)
if not exist "pom.xml" echo [setup] warning: no pom.xml in "%CD%" (mvn searches upward from here; for Gradle copy jars into "%LIBDIR%" manually)
if not exist "%LIBDIR%" mkdir "%LIBDIR%"

if defined DO_CLASSES (
    echo [setup] mvn -q compile ...
    call mvn -q compile
    if errorlevel 1 (
        echo [setup] mvn compile failed
        exit /b 1
    )
)

echo [setup] mvn -q dependency:copy-dependencies -DoutputDirectory="%LIBDIR%" ...
call mvn -q dependency:copy-dependencies -DincludeScope=runtime "-DoutputDirectory=%LIBDIR%"
if errorlevel 1 (
    echo [setup] mvn dependency:copy-dependencies failed
    exit /b 1
)

set "JARCNT=0"
for %%f in ("%LIBDIR%\*.jar") do set "JARCNT=1"
if "%JARCNT%"=="0" echo [setup] warning: project produced no jars. Run inside a Maven project root, or copy dependency jars into lib\ manually.

rem jackson-databind is NOT a transitive dep of Redisson and often missing.
call :ensure_jackson

rem ---------- 2. business classes ----------
if defined DO_CLASSES (
    if exist "target\classes\" (
        if not exist "%LIBDIR%\classes\" mkdir "%LIBDIR%\classes"
        echo [setup] copying business classes to lib\classes ...
        robocopy "target\classes" "%LIBDIR%\classes" /e >nul
        if errorlevel 8 (
            echo [setup] copying classes failed
            exit /b 1
        )
    ) else (
        echo [setup] warning: target\classes not found, skipped (needed to deserialize business objects)
    )
)

rem ---------- environment hint ----------
set "JAVA_OK="
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" set "JAVA_OK=1"
where java.exe >nul 2>&1 && set "JAVA_OK=1"
if not defined JAVA_OK echo [setup] warning: java not found. Running the codec needs JDK/JRE 8+ (set JAVA_HOME or add to PATH)

echo [setup] dependencies collected into "%LIBDIR%"

if defined DO_INSTALL goto do_install
exit /b 0

rem ===================== 3. install to fixed directory =====================
:do_install
echo [setup] installing to: "%DEST%"
if not exist "%DEST%\lib\classes" mkdir "%DEST%\lib\classes"
copy /y "%SCRIPT_DIR%\redisson-codec.jar" "%DEST%\" >nul
if errorlevel 1 (
    echo [setup] redisson-codec.jar not found, package incomplete
    exit /b 1
)
copy /y "%SCRIPT_DIR%\run-redisson-codec.cmd" "%DEST%\" >nul
copy /y "%SCRIPT_DIR%\run-redisson-codec.sh" "%DEST%\" >nul
copy /y "%SCRIPT_DIR%\README.md" "%DEST%\" >nul
if exist "%LIBDIR%\" robocopy "%LIBDIR%" "%DEST%\lib" /e >nul

echo.
echo   Paste this line into RedisME Settings - Custom Codec - Command:
echo.
echo      "%DEST%\run-redisson-codec.cmd"
echo.
echo   Tip: tick Auto. Keep the same install dir on every machine, then
echo        switching machines only requires re-running this script.
exit /b 0

rem ===================== helper: ensure jackson-databind ===================
:ensure_jackson
if not defined USERPROFILE exit /b 0
if exist "%LIBDIR%\jackson-databind-*.jar" exit /b 0
set "JB="
for /f "delims=" %%f in ('dir /b /s /o:-n "%USERPROFILE%\.m2\repository\com\fasterxml\jackson\core\jackson-databind\*\jackson-databind-*.jar" 2^>nul') do (
    if not defined JB set "JB=%%f"
)
if defined JB (
    copy /y "%JB%" "%LIBDIR%\" >nul
    echo [setup] jackson-databind copied from local repository
    exit /b 0
)
echo [setup] warning: jackson-databind missing in lib\ and not in local repo. Add it manually (2.10+):
echo         https://repo1.maven.org/maven2/com/fasterxml/jackson/core/jackson-databind/
exit /b 0

rem ===================== usage ============================================
:usage
echo.
echo RedisME Redisson custom-codec one-shot setup
echo.
echo   step 1 (in your Java project root):  setup.cmd --collect --with-classes
echo   step 2:                              setup.cmd --install
echo.
echo Options:
echo   --collect          run mvn in current dir, collect jars into lib\
echo   --with-classes     also mvn compile and copy classes into lib\classes\
echo   --install          install to the fixed dir (default %%USERPROFILE%%\redis\custom\redisson)
echo   --dest ^<dir^>       override the install dir
echo.
exit /b 0
