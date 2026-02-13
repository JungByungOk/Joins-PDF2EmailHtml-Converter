@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d C:\Github\pdf2email
call npm start 2>&1
echo EXIT_CODE=%ERRORLEVEL%
