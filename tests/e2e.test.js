import { it } from 'node:test';
import { execFileSync } from 'node:child_process';

// The old active-chart integration suite mutated arbitrary personal state.
// The modern smoke validates dedicated resources before every scenario.
it('dedicated Windows Desktop regression smoke', { skip: process.env.TRADINGVIEW_DESKTOP_SMOKE !== '1' }, () => {
  execFileSync(process.execPath, ['scripts/smoke-desktop.mjs'], { stdio: 'inherit', timeout: 180000 });
});
