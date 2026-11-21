# 번역 도우미 설치 — PowerShell 창에 아래 한 줄을 붙여 넣고 Enter (관리자 권한 필요 없음):
#   irm https://raw.githubusercontent.com/wotjq2/th-korean/main/line-helper/install.ps1 | iex
# 하는 일: %LOCALAPPDATA%\th-korean-helper 에 GitHub 의 line-helper 파일을 받는다 → Node.js 가 없거나 18 보다 옛것이면
# 휴대용 Node 를 그 안에 받는다 → 글자 읽기 모듈(tesseract.js)을 깐다 → 윈도우에 들어 있는 컴파일러로
# 번역도우미.exe 를 만든다 → 윈도우 켤 때 같이 켜기·시작 메뉴 바로가기를 만들고 켠다.
# 다시 실행하면 새 판으로 고쳐 깐다(설정·기록은 data 폴더에 그대로). 그 뒤 새 판은 번역 도우미가 스스로 받는다(Updater.cs).
# irm | iex 로 돌기 때문에 exit 대신 블록 하나로 감싸 두었다(실패해도 사용자의 PowerShell 창은 닫히지 않게).
& {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue' # PS 5.1 의 진행 막대가 내려받기를 크게 느리게 한다
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
    $repo = 'wotjq2/th-korean'
    $dir = Join-Path $env:LOCALAPPDATA 'th-korean-helper'
    $exe = Join-Path $dir '번역도우미.exe'
    $gh = @{ 'User-Agent' = 'th-korean-helper'; Accept = 'application/vnd.github+json' }
    try {
        Write-Host "번역 도우미를 설치합니다 → $dir" -ForegroundColor Cyan
        Get-Process -Name '번역도우미', 'LineHelper' -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Milliseconds 800
        New-Item -ItemType Directory -Force $dir | Out-Null

        Write-Host '1/5 프로그램 파일 받는 중…'
        $files = Invoke-RestMethod "https://api.github.com/repos/$repo/contents/line-helper?ref=main" -Headers $gh
        foreach ($f in $files | Where-Object { $_.type -eq 'file' }) {
            # 파일 지문(sha)으로 받는다 — raw 주소는 올린 뒤 몇 분 동안 옛 사본을 줄 수 있다.
            $blob = Invoke-RestMethod "https://api.github.com/repos/$repo/git/blobs/$($f.sha)" -Headers $gh
            [IO.File]::WriteAllBytes((Join-Path $dir $f.name), [Convert]::FromBase64String($blob.content))
        }

        Write-Host '2/5 Node.js 확인…'
        $node = $null
        $mine = Join-Path $dir 'node\node.exe'
        $sys = Get-Command node.exe -ErrorAction SilentlyContinue
        if (Test-Path $mine) { $node = $mine }
        elseif ($sys -and [int]((& $sys.Source -v).TrimStart('v').Split('.')[0]) -ge 18) { $node = $sys.Source }
        else {
            # PS 5.1 의 Invoke-RestMethod 는 JSON 배열을 통째 하나로 흘려보낸다 — 괄호로 감싸야 판마다 나뉜다.
            $v = ((Invoke-RestMethod 'https://nodejs.org/dist/index.json') | Where-Object { $_.lts } | Select-Object -First 1).version
            Write-Host "   Node.js $v 휴대용을 받는 중… (1~2분)"
            $zip = Join-Path $env:TEMP "node-$v-win-x64.zip"
            Invoke-WebRequest "https://nodejs.org/dist/$v/node-$v-win-x64.zip" -OutFile $zip -UseBasicParsing
            $tmp = Join-Path $dir 'node-tmp'
            if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
            New-Item -ItemType Directory $tmp | Out-Null
            # 윈도우 10 1803 부터 들어 있는 tar 가 Expand-Archive 보다 훨씬 빠르다.
            if (Get-Command tar.exe -ErrorAction SilentlyContinue) { tar.exe -xf $zip -C $tmp } else { Expand-Archive $zip $tmp -Force }
            Move-Item (Join-Path $tmp "node-$v-win-x64") (Join-Path $dir 'node')
            Remove-Item $tmp, $zip -Recurse -Force
            $node = $mine
        }
        Write-Host "   $node"

        Write-Host '3/5 글자 읽기 모듈(tesseract.js) 까는 중…'
        $cli = Join-Path (Split-Path $node) 'node_modules\npm\bin\npm-cli.js'
        Push-Location $dir
        $ErrorActionPreference = 'Continue' # npm 이 stderr 에 쓰는 경고를 실패로 보지 않게
        try {
            if (Test-Path $cli) { & $node $cli ci --omit=dev --no-audit --no-fund | Out-Host }
            else { & npm.cmd ci --omit=dev --no-audit --no-fund | Out-Host }
            if ($LASTEXITCODE -ne 0) { throw "npm ci 실패($LASTEXITCODE)" }
        }
        finally { Pop-Location; $ErrorActionPreference = 'Stop' }

        Write-Host '4/5 번역도우미.exe 만드는 중…'
        & "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'build.ps1') | Out-Host
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $exe)) { throw '번역도우미.exe 를 만들지 못했습니다' }

        Write-Host '5/5 윈도우 켤 때 같이 켜기 · 시작 메뉴 바로가기…'
        # 막 만든 윈도우 사용자에게는 Run 키가 아직 없다 — 없을 때만 만든다(있는 키에 New-Item -Force 를 하면 다른 프로그램의
        # 시작 등록까지 지워질 수 있다). 2026-11-22 깨끗한 윈도우 설치 시험(GitHub Actions)에서 여기서 멈춰 도우미가 안 켜졌다.
        $runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
        if (-not (Test-Path $runKey)) { New-Item -Path $runKey | Out-Null }
        Set-ItemProperty $runKey -Name 'th-korean-line-helper' -Value "`"$exe`""
        # 시작 메뉴 바로가기는 없어도 도우미는 돈다 — 만들지 못해도 알리기만 하고 도우미는 켠다(전에는 여기서 설치가 멈춰
        # 도우미가 켜지지 않았다 — 2026-11-22 깨끗한 윈도우 시험: 'Value does not fall within the expected range').
        try {
            $programs = [Environment]::GetFolderPath('Programs')
            if (-not $programs) { $programs = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs' }
            if (-not (Test-Path $programs)) { New-Item -ItemType Directory -Force $programs | Out-Null }
            # WScript.Shell 은 시스템 언어 코드(영어·태국어 윈도우 등)로 못 쓰는 글자가 든 .lnk 이름을 거부한다('Value does not
            # fall within the expected range' — 한국어 윈도우에서만 됐다). 영어 이름으로 만든 뒤 한글 이름으로 바꾼다.
            $tmpLnk = Join-Path $programs 'th-korean-helper.lnk'
            $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut($tmpLnk)
            $lnk.TargetPath = $exe
            $lnk.WorkingDirectory = $dir
            $lnk.Save()
            Move-Item -LiteralPath $tmpLnk -Destination (Join-Path $programs '번역 도우미.lnk') -Force
        }
        catch { Write-Host "   (시작 메뉴 바로가기는 만들지 못했습니다 — 도우미는 그대로 켭니다: $($_.Exception.Message))" -ForegroundColor Yellow }
        Start-Process $exe

        Write-Host ''
        Write-Host '설치 끝! 작업 표시줄 오른쪽 아래의 초록 "태" 아이콘이 번역 도우미입니다.' -ForegroundColor Green
        Write-Host ' - 영어로 된 프로그램 창에서 Ctrl+Alt+K = 그 자리에 한국어로 덮기 (한 번 더 = 끄기)'
        Write-Host ' - LINE PC: 입력칸 위 막대에서 언어를 고르면 한국어로 쓰고 Enter 한 번에 바꿔 보냄'
        Write-Host ' - 새 판은 GitHub 에서 스스로 받고, 윈도우를 켜면 같이 켜집니다.'
    }
    catch {
        Write-Host "설치 실패: $($_.Exception.Message)" -ForegroundColor Red
        # 어느 줄에서 멈췄는지 — 사용자가 이 화면을 보내 주면 원인을 바로 안다
        Write-Host ($_.InvocationInfo.PositionMessage) -ForegroundColor DarkGray
    }
}
