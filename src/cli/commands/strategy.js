import { register } from '../router.js';
import { getProperties,setProperties } from '../../core/strategy-properties.js';
register('strategy',{description:'Verified native strategy Properties',subcommands:new Map([
  ['properties',{description:'Read current typed native Properties and field support/units; never infer source defaults',options:{'strategy-id':{type:'string',description:'Exact owned current strategy study ID'}},handler:opts=>getProperties({strategy_id:opts['strategy-id']})}],
  ['set-properties',{description:'Validate all Properties before one native input update, read back and wait for the matching recalculation',options:{values:{type:'string',description:'Nonempty JSON object of named Properties'},'strategy-id':{type:'string',description:'Exact owned current strategy study ID'},timeout:{type:'string',description:'Finite recalculation wait milliseconds (default 30000)'}},handler:opts=>setProperties({values:opts.values,strategy_id:opts['strategy-id'],timeout:Number(opts.timeout||30000)})}],
])});
