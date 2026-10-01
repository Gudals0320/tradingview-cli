// Read-only evidence: keep internal payloads out of console and committed records.
import { configureTarget, evaluate, disconnect } from '../../../src/connection.js';
import { STRATEGY_PAGE_CODE } from '../../../src/strategy-state.js';
import { findPineController } from '../../../src/core/desktop-dom.js';
import { writeFileSync } from 'node:fs';
const [target,label='probe'] = process.argv.slice(2);
configureTarget(target);
try {
  const result = await evaluate(`(() => {
    if (!location.href.includes('/chart/kdn7wAFi/')) throw new Error('Wrong layout');
    ${STRATEGY_PAGE_CODE};
    const controller=(${findPineController.toString()})(document);
    const state=controller?._editorStore?.getStore?.().getState();
    const epoch=window.__tvCliCompilation;
    const strategyStatus=compilationState(window);
    return { nativeCompileKeys:Object.keys(window).filter(k=>k.startsWith('__tvCli')),
      compile_state:{phase:strategyStatus.phase,error:strategyStatus.error},
      epoch:{phase:epoch?.phase,strategy_name:epoch?.strategy_name,requires_compiled_change:epoch?.requires_compiled_change,
        baseline_count:epoch?.baselines?.length,report_verified:epoch?.report_verified},
      editor:{identity:controller?.getScriptIdVersion(),state_keys:Object.keys(state||{}),ui:state?.ui?.script},
      strategies:pageStrategies(window).filter(s=>s.name==='CLI-QA Large Edit 20261001').map(s=>({id:s.id,name:s.name,
        pine_identity:s.inputs.filter(i=>['pineId','pineVersion'].includes(i.id)),runtime_error:s.runtime_error,status_type:s.status_type,
        complete:reportIsComplete(s.report),closed_trades:s.report?.performance?.all?.totalTrades,
        changed:!epoch?.baselines?.some(b=>b.id===s.id&&b.compiled_identity===compiledIdentity(s.inputs))}))};
  })()`);
  writeFileSync(`results/pine-qa/large-edit/${label}.json`,JSON.stringify(result,null,2));
  const safe={...result,editor:{state_keys:result.editor.state_keys},strategies:result.strategies.map(({pine_identity,...s})=>({...s,version:pine_identity.find(i=>i.id==='pineVersion')?.value}))};
  console.log(JSON.stringify(safe,null,2));
} finally {await disconnect();}
