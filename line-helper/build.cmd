@echo off
rem Build LineHelper.exe with the .NET Framework 4 compiler that ships with Windows.
set FW=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319
"%FW%\csc.exe" /nologo /codepage:65001 /target:winexe /optimize+ /out:"%~dp0LineHelper.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:"%FW%\WPF\UIAutomationClient.dll" /r:"%FW%\WPF\UIAutomationTypes.dll" /r:"%FW%\WPF\WindowsBase.dll" "%~dp0LineHelper.cs"
