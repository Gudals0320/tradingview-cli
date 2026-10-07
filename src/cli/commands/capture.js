import { register } from '../router.js';
import * as core from '../../core/capture.js';

register('screenshot', {
  description: 'Capture the owned tab with backend, actual selector/crop/fallback and unknown axis verification metadata',
  options: {
    method: {type:'string',description:'cdp (selected tab, default) or api (owned chart screenshot UI, no CDP fallback)'},
    region: { type: 'string', short: 'r', description: 'Region: full, chart, strategy_tester' },
    output: { type: 'string', short: 'o', description: 'Custom filename (without .png)' },
  },
  handler: (opts) => core.captureScreenshot({
    region: opts.region,
    filename: opts.output,
    method: opts.method,
  }),
});
