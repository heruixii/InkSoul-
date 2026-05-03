$Host.UI.RawUI.WindowTitle = 'InkSoul / 墨魂 Launcher'
$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptRoot

$logFile = Join-Path $scriptRoot 'start.log'
"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ====" | Out-File -FilePath $logFile -Append -Encoding utf8

function Log($message) {
    $message | Tee-Object -FilePath $logFile -Append
}

try {
    Log '========================================='
    Log 'InkSoul / 墨魂 Launcher'
    Log '========================================='
    Log "Root: $scriptRoot"
    Log ''

    $nodeVersion = node -v
    $npmVersion = npm -v
    Log "Node version: $nodeVersion"
    Log "npm version: $npmVersion"
    Log ''

    if (-not (Test-Path '.\\server\\package.json')) {
        throw 'Missing server\\package.json'
    }

    if (-not (Test-Path '.\\client\\package.json')) {
        throw 'Missing client\\package.json'
    }

    if (Test-Path '.\\server\\node_modules') {
        Log 'Server node_modules exists.'
    } else {
        Log 'Installing server dependencies...'
        npm install --prefix server --verbose --no-audit --no-fund 2>&1 | Tee-Object -FilePath $logFile -Append
        if ($LASTEXITCODE -ne 0) {
            throw 'Server dependency install failed.'
        }
    }

    if (Test-Path '.\\client\\node_modules') {
        Log 'Client node_modules exists.'
    } else {
        Log 'Installing client dependencies...'
        npm install --prefix client --verbose --no-audit --no-fund 2>&1 | Tee-Object -FilePath $logFile -Append
        if ($LASTEXITCODE -ne 0) {
            throw 'Client dependency install failed.'
        }
    }

    Log ''
    Log 'Starting server window...'
    Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$scriptRoot'; npm run dev --prefix server"

    Start-Sleep -Seconds 2

    Log 'Starting client window...'
    Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$scriptRoot'; npm run dev --prefix client"

    Start-Sleep -Seconds 3
    Start-Process 'http://localhost:3000'

    Log ''
    Log 'Done. Browser should open at http://localhost:3000'
    Log "If anything closes, check start.log: $logFile"
} catch {
    Log ''
    Log ('ERROR: ' + $_.Exception.Message)
    Log "See log file: $logFile"
}

Write-Host ''
Write-Host "Log file: $logFile"
Read-Host 'Press Enter to close this launcher window'
