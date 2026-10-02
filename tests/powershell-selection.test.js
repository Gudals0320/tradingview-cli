import {it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const modulePath=fileURLToPath(new URL('../scripts/TradingViewCli.psm1',import.meta.url));
for(const shell of ['powershell.exe','pwsh'])it(`${shell} selection, exact native argv/stdin and profile preservation`,{skip:process.platform!=='win32'},()=>{
  const root=mkdtempSync(join(tmpdir(),'tv-ps-selection-')),fake=join(root,'fake-cli.mjs'),script=join(root,'check.ps1'),profile=join(root,'profile.ps1');
  writeFileSync(fake,`const a=process.argv.slice(2);let input='';if(a.includes('--stdin'))for await(const chunk of process.stdin)input+=chunk;console.log(JSON.stringify(a[0]==='workspace'&&a[1]==='select'?{success:true,name:a[2],layout:'layout-'+a[2]}:a[0]==='layout'?{success:true,layouts:[{id:'layout-alpha'}]}:{success:true,selection:process.env.TV_WORKSPACE,explicit:a[1],client:process.env.TV_SELECTION_CLIENT||null,args:a,input}));`);
  writeFileSync(profile,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('# existing 한국어 content\n')]));
  const before=readFileSync(profile),quote=value=>`'${value.replace(/'/g,"''")}'`;
  const check=String.raw`Import-Module ${quote(modulePath)}
$env:TV_CLI_ENTRY=${quote(fake)}
$env:TV_WORKSPACE='original'
$env:TV_LAYOUT='original-layout'
$userBefore=[Environment]::GetEnvironmentVariable('TV_WORKSPACE','User')
$encodingBefore=$OutputEncoding.WebName
$selected=tv workspace select alpha | ConvertFrom-Json
$explicit=tv --workspace beta state | ConvertFrom-Json
if($env:TV_WORKSPACE -ne 'alpha' -or $explicit.explicit -ne 'beta' -or !$selected.selection_applied){throw 'Selection leaked'}
if($env:TV_SELECTION_CLIENT){throw 'Module marker leaked'}
$same=tv layout select layout-alpha | ConvertFrom-Json
if($env:TV_WORKSPACE -ne 'alpha' -or $same.workspace_selection_cleared){throw 'Matching layout cleared selection'}
$expected='{"in_0":21,"tag":"한국어 \"quoted\" C:\\path\\"}'
$payload=tv --workspace beta indicator set id --inputs $expected | ConvertFrom-Json
if($payload.args[6] -cne $expected){throw 'Quoted native argument changed'}
$stdin='// 한국어' | tv --workspace beta --stdin | ConvertFrom-Json
if(!$stdin.input.Contains('한국어')){throw ('UTF8 stdin changed: '+($stdin|ConvertTo-Json -Compress))}
if($OutputEncoding.WebName -ne $encodingBefore){throw 'Caller encoding changed'}
Install-TvProfile -ProfilePath ${quote(profile)}
Install-TvProfile -ProfilePath ${quote(profile)}
if([Environment]::GetEnvironmentVariable('TV_WORKSPACE','User') -ne $userBefore){throw 'User environment changed'}
@{success=$true;selection=$env:TV_WORKSPACE;exit=$LASTEXITCODE}|ConvertTo-Json -Compress
`;
  writeFileSync(script,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(check)]));
  const result=spawnSync(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{encoding:'utf8',timeout:20000});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout.trim()).selection,'alpha');
  const after=readFileSync(profile);assert.deepEqual(after.subarray(0,before.length),before);assert.equal(after.toString('utf8').split('# tradingview-cli-selection').length-1,1);
});
