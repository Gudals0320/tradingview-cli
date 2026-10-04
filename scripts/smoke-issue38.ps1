param([string]$Workspace = 'executor-issues')
$ErrorActionPreference = 'Stop'
function Invoke-TestTv([string[]]$Arguments, [int]$Expected = 0) {
    $raw = & node src/cli/index.js @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne $Expected) { throw "Unexpected CLI exit $exitCode (expected $Expected): $raw" }
    return ($raw -join "`n" | ConvertFrom-Json)
}
function Canonical([string]$Text) { return [regex]::Replace($Text, '\r\n?', "`n") }
$null = Invoke-TestTv @('status')
$null = Invoke-TestTv @('--workspace', $Workspace, 'pine', 'compile', '--save')
$source = [IO.File]::ReadAllText((Join-Path $PWD 'scripts/fixtures/issue-strategy.pine'))
$lf = (Canonical $source) + "// EOL live probe`n"
$dir = Join-Path $PWD 'results/issue38'
$null = New-Item -ItemType Directory -Path $dir -Force
$utf8 = [Text.UTF8Encoding]::new($false)
$cases = @{'lf' = $lf; 'crlf' = $lf.Replace("`n", "`r`n"); 'mixed' = $lf.Substring(0, $lf.Length - 1) + "`r`n"; 'cr' = $lf.Replace("`n", "`r")}
$receipts = @()
foreach ($name in @('lf', 'crlf', 'mixed', 'cr')) {
    $path = Join-Path $dir "$name.pine"
    [IO.File]::WriteAllText($path, $cases[$name], $utf8)
    $set = Invoke-TestTv @('--workspace', $Workspace, 'pine', 'set', '--file', $path)
    $get = Invoke-TestTv @('--workspace', $Workspace, 'pine', 'get')
    if ((Canonical $get.source) -cne $lf) { throw "Source mismatch: $name" }
    $receipts += @{case = $name; exit = 0; success = $set.success; equal = $true; hash = $set.applied_hash}
}
$invalid = Invoke-TestTv @('--workspace', $Workspace, 'data', 'strategy') 1
if ($invalid.code -ne 'REPORT_INVALIDATED') { throw "Expected REPORT_INVALIDATED, got $($invalid.code)" }
$raw = Get-Content (Join-Path $dir 'lf.pine') -Raw | & node src/cli/index.js --workspace $Workspace pine set 2>&1
if ($LASTEXITCODE -ne 0) { throw "PowerShell pipe failed: $raw" }
$set = $raw -join "`n" | ConvertFrom-Json
$get = Invoke-TestTv @('--workspace', $Workspace, 'pine', 'get')
if ((Canonical $get.source) -cne ($lf + "`n")) { throw 'PowerShell appended EOL differs from expected full source' }
$receipts += @{case = 'PowerShell Get-Content -Raw stdin'; exit = 0; success = $set.success; equal = $true; hash = $set.applied_hash}
$compile = Invoke-TestTv @('--workspace', $Workspace, 'pine', 'compile', '--save')
$report = Invoke-TestTv @('--workspace', $Workspace, 'data', 'strategy')
@{success = $true; powershell = $PSVersionTable.PSVersion.ToString(); cases = $receipts; invalidation = $invalid.code; compiled = $compile.compiled; saved = $compile.saved; report_success = $report.success} | ConvertTo-Json -Depth 5 -Compress
