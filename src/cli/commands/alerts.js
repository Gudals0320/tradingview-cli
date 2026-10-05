import { register } from '../router.js';
import * as core from '../../core/alerts.js';
import {createStrategyServerAlert,getStrategyServerAlert,operateStrategyServerAlert,getStrategyAlertFires,createStrategyAlertThenPause} from '../../core/strategy-alerts.js';
import {updateStrategyServerAlert,planStrategyAlertReplacement,replaceStrategyServerAlert} from '../../core/strategy-alert-workflows.js';

const replacementOptions={'request-id':{type:'string',description:'Exact owned old creation ID'},'replacement-request-id':{type:'string',description:'Distinct stable new creation ID'},'operation-id':{type:'string',description:'Stable replacement workflow ID'},policy:{type:'string',description:'gap: pause old first; overlap: verify new first'},mode:{type:'string',description:'fills, alerts or both'},name:{type:'string',description:'New explicit name'},message:{type:'string',description:'New exact message; public output hashes only'},expiration:{type:'string',description:'New explicit-offset expiration'},'strategy-id':{type:'string',description:'Exact current owned strategy ID'}};
const replacementInput=opts=>({request_id:opts['request-id'],replacement_request_id:opts['replacement-request-id'],operation_id:opts['operation-id'],policy:opts.policy,mode:opts.mode,name:opts.name,message:opts.message,expiration:opts.expiration,strategy_id:opts['strategy-id']});

register('alert', {
  description: 'Alert tools (list, create, delete)',
  subcommands: new Map([
    ['strategy-update',{description:'Update owned name/message/expiration using native modify-and-restart; frozen strategy preserved, becomes active',options:{'request-id':{type:'string',description:'Exact owned creation ID'},'operation-id':{type:'string',description:'Stable update ID; uncertain requests are never resent'},name:{type:'string',description:'New name'},message:{type:'string',description:'New exact message; output hashes only'},expiration:{type:'string',description:'New explicit-offset future expiration'}},handler:opts=>updateStrategyServerAlert({request_id:opts['request-id'],operation_id:opts['operation-id'],name:opts.name,message:opts.message,expiration:opts.expiration})}],
    ['strategy-replace-plan',{description:'Read-only exact old/new request plan with explicit gap/overlap policy; no server changes',options:replacementOptions,handler:opts=>planStrategyAlertReplacement(replacementInput(opts))}],
    ['strategy-replace',{description:'Explicit staged strategy snapshot replacement; old alert retained paused, non-atomic gap/overlap reported',options:replacementOptions,handler:opts=>replaceStrategyServerAlert(replacementInput(opts))}],
    ['strategy-create-then-pause',{description:'Opt-in two-step active creation then pause; non-atomic and may fire during the measured active window',options:{'request-id':{type:'string',description:'Stable creation/policy ID'},mode:{type:'string',description:'fills, alerts or both'},name:{type:'string',description:'Explicit name'},message:{type:'string',description:'Exact text/JSON/placeholders; public output hashes only'},expiration:{type:'string',description:'Explicit-offset ISO; future for new creation'},'strategy-id':{type:'string',description:'Exact owned current strategy ID'}},handler:opts=>createStrategyAlertThenPause({request_id:opts['request-id'],mode:opts.mode,name:opts.name,message:opts.message,expiration:opts.expiration,active:true,strategy_id:opts['strategy-id']})}],
    ['strategy-fires',{description:'Finite native internal fire log for an exact owned alert; messages hashed and external delivery omitted',options:{'request-id':{type:'string',description:'Exact owned creation request ID'},limit:{type:'string',description:'Native page size 1..50 (default 50)'},before:{type:'string',description:'Native fire-ID cursor from next_before; not a timestamp'}},handler:opts=>getStrategyAlertFires({request_id:opts['request-id'],limit:Number(opts.limit||50),before:opts.before===undefined?undefined:Number(opts.before)})}],
    ...['pause','resume','delete'].map(action=>['strategy-'+action,{description:'Explicit owned strategy alert '+action+' with fresh verification; stable operation IDs never replay uncertainty',options:{'request-id':{type:'string',description:'Exact owned creation request ID'},'operation-id':{type:'string',description:'Stable action ID; repeats inspect desired state without sending again'},'after-operation-id':{type:'string',description:'Explicit new pause after an exact unknown pause, only when fresh state is active'}},handler:opts=>operateStrategyServerAlert({request_id:opts['request-id'],operation_id:opts['operation-id'],after_operation_id:opts['after-operation-id'],action})}]),
    ['strategy-create',{description:'Create a pinned owned strategy server snapshot and verify exact fresh readback; stable requests never blindly replay',options:{'request-id':{type:'string',description:'Stable creation ID; repeated requests inspect the original snapshot'},mode:{type:'string',description:'fills, alerts or both'},name:{type:'string',description:'Explicit name; a unique tv request suffix is appended'},message:{type:'string',description:'Exact text/JSON or TV placeholders; output contains only its SHA-256'},expiration:{type:'string',description:'Future explicit-offset ISO timestamp'},paused:{type:'boolean',description:'Create initially inactive'},'strategy-id':{type:'string',description:'Exact current owned strategy ID'}},handler:opts=>createStrategyServerAlert({request_id:opts['request-id'],mode:opts.mode,name:opts.name,message:opts.message,expiration:opts.expiration,active:!opts.paused,strategy_id:opts['strategy-id']})}],
    ['strategy-get',{description:'Fresh read of an exact owned creation request; no server changes or private outcome writes',options:{'request-id':{type:'string',description:'Exact recorded creation request ID'}},handler:opts=>getStrategyServerAlert({request_id:opts['request-id']})}],
    ['list', {
      description: 'List active alerts',
      handler: () => core.list(),
    }],
    ['create', {
      description: 'Create a price alert',
      options: {
        price: { type: 'string', short: 'p', description: 'Price level' },
        condition: { type: 'string', short: 'c', description: 'Condition: crossing, greater_than, less_than' },
        message: { type: 'string', short: 'm', description: 'Alert message' },
      },
      handler: (opts) => core.create({
        price: Number(opts.price),
        condition: opts.condition || 'crossing',
        message: opts.message,
      }),
    }],
    ['delete', {
      description: 'Delete alerts',
      options: {
        all: { type: 'boolean', description: 'Delete all alerts' },
        id: { type: 'string', description: 'Alert id to delete (from alert list)' },
      },
      handler: (opts) => core.deleteAlerts({ delete_all: opts.all, alert_id: opts.id ? Number(opts.id) : undefined }),
    }],
  ]),
});
