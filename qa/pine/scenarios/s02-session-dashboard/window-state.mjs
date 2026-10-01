// S02 setup workaround: inspect the TradingView Desktop window through the CLI's own ui eval
// bridge. NOTE: this Desktop build does not implement Browser.getWindowForTarget, so window
// geometry is read from the renderer instead of the CDP Browser domain.
// Usage: node qa/pine/scenarios/s02-session-dashboard/window-state.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
const RAW = 'results/pine-scenarios/s02-session-dashboard';
const target = existsSync(RAW + '/target.txt') ? readFileSync(RAW + '/target.txt', 'utf8').trim() : null;
if (!target) throw new Error('results/pine-scenarios/s02-session-dashboard/target.txt is required');
const expression = "JSON.stringify({visibility:document.visibilityState,w:innerWidth,h:innerHeight,outerW:window.outerWidth,outerH:window.outerHeight})";
const args = ['--target', target, 'ui', 'eval', expression];
const r = spawnSync(process.execPath, ['src/cli/index.js', ...args], { encoding: 'utf8', timeout: 65000, maxBuffer: 8 * 1024 * 1024 });
console.log(JSON.stringify({ target, exit_code: r.status, result: r.stdout.trim(), stderr: r.stderr.trim() }, null, 1));

