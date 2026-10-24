@echo off
rem Build LineHelper.exe with the .NET Framework 4 compiler that ships with Windows.
rem ScreenKorean.cs uses the built-in Windows OCR through the WinRT metadata in System32\WinMetadata.
set FW=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319
set WM=%WINDIR%\System32\WinMetadata
"%FW%\csc.exe" /nologo /codepage:65001 /target:winexe /optimize+ /out:"%~dp0LineHelper.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:"%FW%\WPF\UIAutomationClient.dll" /r:"%FW%\WPF\UIAutomationTypes.dll" /r:"%FW%\WPF\WindowsBase.dll" /r:"%FW%\System.Runtime.dll" /r:"%FW%\System.Runtime.WindowsRuntime.dll" /r:"%WM%\Windows.Foundation.winmd" /r:"%WM%\Windows.Media.winmd" /r:"%WM%\Windows.Graphics.winmd" /r:"%WM%\Windows.Storage.winmd" /r:"%WM%\Windows.Globalization.winmd" /r:"%WM%\Windows.Security.winmd" "%~dp0LineHelper.cs" "%~dp0ScreenKorean.cs"
