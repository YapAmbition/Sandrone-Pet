@echo off
setlocal
if not exist bin mkdir bin
cl /nologo /std:c++17 /O2 /MT /EHsc src\windows\fullscreen-helper.cpp /Fe:bin\fullscreen-helper.exe user32.lib dwmapi.lib
if errorlevel 1 exit /b %errorlevel%
