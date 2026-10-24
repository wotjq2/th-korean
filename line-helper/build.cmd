@echo off
rem Builds the helper (Korean exe name) through build.ps1 - cmd cannot read Korean text inside a UTF-8 .cmd file.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
