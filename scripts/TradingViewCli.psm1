# Selection belongs to this PowerShell process, never to User/Machine environment.
# Document preparation uses an explicit name, stable request ID and current generation:
# tv workspace pine-prepare research-a --create 'Research A Strategy' --file strategy.pine --request-id research-a-document --generation EXACT_GENERATION --mount
# tv --workspace research-a strategy set-properties --values '{"commission_type":"percent","commission_value":0.1}' --timeout 30000
# tv --workspace research-a backtest run --mode deep --from 2018-01-01T00:00:00Z --to 2018-01-07T00:00:00Z --timezone UTC --request-id historical-week-1
# tv workspace backtest-archive research-a --request-id historical-week-1 --run-id EXACT_RUN_ID --acknowledge-no-adoption
# tv --workspace research-a data equity --list-plots
# tv --workspace research-a data equity --plot-id plot_1 --export results/equity.csv
# tv --workspace research-a alert strategy-create --request-id strategy-week-1 --mode both --name 'Research QA' --message '{{strategy.order.alert_message}}' --expiration 2027-01-01T00:00:00Z
# tv --workspace research-a alert strategy-get --request-id strategy-week-1
# tv --workspace research-a alert strategy-pause --request-id strategy-week-1 --operation-id stop-week-1
# tv --workspace research-a alert strategy-resume --request-id strategy-week-1 --operation-id restart-week-1
# tv --workspace research-a alert strategy-fires --request-id strategy-week-1 --limit 50
$script:TvModulePath = $PSCommandPath
function Invoke-TvApplication {
    param([string[]]$Arguments, [object[]]$InputValues = @())
    $nodeApplication = Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1
    $entryPath = $env:TV_CLI_ENTRY
    if (!$entryPath) {
        $application = Get-Command tv -CommandType Application -ErrorAction Stop | Select-Object -First 1
        if ($application.Source.EndsWith('.cmd')) {
            $entryPath = Join-Path (Split-Path -Parent $application.Source) 'node_modules\tradingview-cli\src\cli\index.js'
        } else { $entryPath = $application.Source }
    }
    if (!(Test-Path -LiteralPath $entryPath)) { throw 'Cannot resolve the installed CLI entry. Set TV_CLI_ENTRY to its index.js path.' }
    $packagePath = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $entryPath) '..\..\package.json'))
    if ((Test-Path -LiteralPath $packagePath) -and $Arguments[0] -notin @('--version','-V','help','update')) {
        $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
        if ($package.name -eq 'tradingview-cli' -and [int]$package.version.Split('.')[0] -lt 2) {
            [Console]::Error.WriteLine('{"success":false,"code":"MODULE_CLI_VERSION_MISMATCH","error":"Update the installed CLI to version 2 before using workspace selection."}')
            $global:LASTEXITCODE = 1; return
        }
    }
    # Function-local preferences preserve the calling shell's settings.
    $OutputEncoding = New-Object Text.UTF8Encoding($false)
    $previousConsoleEncoding = [Console]::OutputEncoding
    try {
    [Console]::OutputEncoding = $OutputEncoding
    $launcher = Join-Path (Split-Path -Parent $script:TvModulePath) 'powershell-launch.mjs'
    $encodedInput = $null
    if($InputValues.Count){$encodedInput=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($InputValues -join "`r`n")+"`r`n"))}
    if (Get-Variable PSNativeCommandArgumentPassing -ErrorAction SilentlyContinue) {
        $PSNativeCommandArgumentPassing = 'Standard'
        if ($InputValues.Count) { $encodedInput | & $nodeApplication.Source $launcher --direct $entryPath @Arguments }
        else { & $nodeApplication.Source $entryPath @Arguments }
        $global:LASTEXITCODE = $LASTEXITCODE
        return
    }
    $json = @{entry=$entryPath;args=@($Arguments);stdin_encoding=$(if($InputValues.Count){'base64'}else{$null})} | ConvertTo-Json -Depth 5 -Compress
    $encodedArguments = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
    if ($encodedArguments.Length -gt 24000) {
        [Console]::Error.WriteLine('{"success":false,"code":"POWERSHELL_ARG_LIMIT","error":"Use file/stdin options for large payloads, or pwsh with standard native argument passing."}')
        $global:LASTEXITCODE = 1; return
    }
    if ($InputValues.Count) { $encodedInput | & $nodeApplication.Source $launcher $encodedArguments }
    else { & $nodeApplication.Source $launcher $encodedArguments }
    $global:LASTEXITCODE = $LASTEXITCODE
    } finally { [Console]::OutputEncoding = $previousConsoleEncoding }
}

function tv {
    $pipelineValues = @($input)
    if ($args.Count -eq 3 -and $args[0] -eq 'workspace' -and $args[1] -eq 'select') {
        $previousClient = $env:TV_SELECTION_CLIENT
        try { $env:TV_SELECTION_CLIENT = 'powershell-module'; $output = @(Invoke-TvApplication -Arguments @($args)) }
        finally { if ($null -eq $previousClient) { Remove-Item Env:TV_SELECTION_CLIENT -ErrorAction SilentlyContinue } else { $env:TV_SELECTION_CLIENT = $previousClient } }
        $code = $LASTEXITCODE
        if ($code -eq 0) {
            $selected = ($output -join "`n") | ConvertFrom-Json
            if ($selected.success) {
                $env:TV_WORKSPACE = [string]$selected.name; $env:TV_LAYOUT = [string]$selected.layout
                $selected | Add-Member -NotePropertyName selection_applied -NotePropertyValue $true -Force
                $output = @($selected | ConvertTo-Json -Depth 10)
            }
        }
        $output
        $global:LASTEXITCODE = $code
        return
    }
    if ($args.Count -eq 3 -and $args[0] -eq 'layout' -and $args[1] -eq 'select') {
        # Selection is validated against the saved layout list, without switching tabs.
        $output = @(Invoke-TvApplication -Arguments @('layout', 'list'))
        $code = $LASTEXITCODE
        if ($code -ne 0) { $output; $global:LASTEXITCODE = $code; return }
        $result = ($output -join "`n") | ConvertFrom-Json
        $requestedLayout = [string]$args[2]
        $layouts = @($result.layouts | Where-Object { [string]$_.id -eq $requestedLayout })
        if ($layouts.Count -ne 1) { Write-Error 'Exact saved layout ID required.'; $global:LASTEXITCODE = 1; return }
        $cleared = $env:TV_LAYOUT -ne [string]$args[2]
        if ($cleared) { Remove-Item Env:TV_WORKSPACE -ErrorAction SilentlyContinue }
        $env:TV_LAYOUT = [string]$args[2]
        @{success=$true;layout=$env:TV_LAYOUT;workspace_selection_cleared=$cleared} | ConvertTo-Json -Compress
        $global:LASTEXITCODE = 0
        return
    }
    Invoke-TvApplication -Arguments @($args) -InputValues $pipelineValues
}

function Install-TvProfile {
    param([string]$ProfilePath = $PROFILE)
    # Explicit and idempotent; preserve all existing profile contents.
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script:TvModulePath))
    $line = "Import-Module ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$encoded'))) # tradingview-cli-selection"
    $encoding = New-Object Text.UTF8Encoding($false)
    if (Test-Path -LiteralPath $ProfilePath) {
        $contents = Get-Content -LiteralPath $ProfilePath -Raw
        if ($contents -and $contents.Contains('# tradingview-cli-selection')) { return }
        $bytes = [IO.File]::ReadAllBytes($ProfilePath)
        if ($bytes.Length -ge 2 -and $bytes[0] -eq 255 -and $bytes[1] -eq 254) { $encoding = [Text.Encoding]::Unicode }
        elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 254 -and $bytes[1] -eq 255) { $encoding = [Text.Encoding]::BigEndianUnicode }
    }
    $directory = Split-Path -Parent $ProfilePath
    if (!(Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
    [IO.File]::AppendAllText($ProfilePath, "`n$line`n", $encoding)
}
Export-ModuleMember -Function tv, Install-TvProfile
