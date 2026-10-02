import { mkdirSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const secured = new Set();
let userSid;

export function secureDirectory(directory) {
  if (secured.has(directory)) return;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    userSid ||= execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', timeout: 5000 })
      .match(/S-1-5-[\d-]+/)?.[0];
    if (!userSid) throw new Error('PRIVATE_STORE_ACL: Could not identify the Windows user SID.');
    // Remove inherited access; permit this user, SYSTEM and local administrators.
    try {
      execFileSync('icacls.exe', [directory, '/inheritance:r', '/grant:r',
        `*${userSid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], {
        encoding: 'utf8', timeout: 5000, windowsHide: true,
      });
    } catch {
      throw Object.assign(new Error('Cannot protect the private store ACL. Use the same OS user and session directory as its owner.'), { code: 'PRIVATE_STORE_ACL' });
    }
  } else chmodSync(directory, 0o700);
  secured.add(directory);
}
