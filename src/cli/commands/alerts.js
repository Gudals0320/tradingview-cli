import { register } from '../router.js';
import * as core from '../../core/alerts.js';
import {createStrategyServerAlert,getStrategyServerAlert,operateStrategyServerAlert,getStrategyAlertFires} from '../../core/strategy-alerts.js';

register('alert', {
  description: 'Alert tools (list, create, delete)',
  subcommands: new Map([
    ['strategy-fires',{description:'Finite native internal fire log for an exact owned alert; messages hashed and external delivery omitted',options:{'request-id':{type:'string',description:'Exact owned creation request ID'},limit:{type:'string',description:'Native page size 1..50 (default 50)'},before:{type:'string',description:'Native fire-ID cursor from next_before; not a timestamp'}},handler:opts=>getStrategyAlertFires({request_id:opts['request-id'],limit:Number(opts.limit||50),before:opts.before===undefined?undefined:Number(opts.before)})}],
    ...['pause','resume','delete'].map(action=>['strategy-'+action,{description:'Explicit owned strategy alert '+action+' with fresh verification; stable operation IDs never replay uncertainty',options:{'request-id':{type:'string',description:'Exact owned creation request ID'},'operation-id':{type:'string',description:'Stable action ID; repeats inspect desired state without sending again'}},handler:opts=>operateStrategyServerAlert({request_id:opts['request-id'],operation_id:opts['operation-id'],action})}]),
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
