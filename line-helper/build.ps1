# 번역도우미.exe 를 윈도우에 들어 있는 .NET Framework 4 컴파일러(C# 5)로 만든다. 예전 이름은 LineHelper.exe.
# ScreenKorean.cs 는 System32\WinMetadata 의 WinRT 정보로 윈도우 내장 OCR 을 쓴다.
# cmd 는 UTF-8 .cmd 안의 한글을 제대로 못 읽어서(파일 이름이 한글) 이 파일은 BOM 붙은 UTF-8 PowerShell 로 둔다.
$fw = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319"
$wm = "$env:WINDIR\System32\WinMetadata"
& "$fw\csc.exe" /nologo /codepage:65001 /target:winexe /optimize+ "/out:$PSScriptRoot\번역도우미.exe" `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll `
    "/r:$fw\WPF\UIAutomationClient.dll" "/r:$fw\WPF\UIAutomationTypes.dll" "/r:$fw\WPF\WindowsBase.dll" `
    "/r:$fw\System.Runtime.dll" "/r:$fw\System.Runtime.WindowsRuntime.dll" `
    "/r:$wm\Windows.Foundation.winmd" "/r:$wm\Windows.Media.winmd" "/r:$wm\Windows.Graphics.winmd" `
    "/r:$wm\Windows.Storage.winmd" "/r:$wm\Windows.Globalization.winmd" "/r:$wm\Windows.Security.winmd" `
    "$PSScriptRoot\LineHelper.cs" "$PSScriptRoot\ScreenKorean.cs"
exit $LASTEXITCODE
