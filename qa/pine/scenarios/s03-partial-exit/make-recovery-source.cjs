const fs=require('fs');
const dir='qa/pine/scenarios/s03-partial-exit/';
const injected=fs.readFileSync(dir+'function-error.pine','utf8');
const corrected=injected.replace('math.qa_missing(runnerStop,','math.max(runnerStop,');
if(corrected===injected)throw Error('Missing injected call');
fs.writeFileSync(dir+'recovery-valid-v6.pine',corrected);
