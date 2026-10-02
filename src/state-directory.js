import { homedir } from 'node:os';
import { join } from 'node:path';

// Durable ownership, journals and names must survive temporary-directory cleanup.
export function stateDirectory() {
  return process.env.TV_STATE_DIR || (process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'tradingview-cli')
    : join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'tradingview-cli'));
}
