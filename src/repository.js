export const REPOSITORY = 'Gudals0320/tradingview-cli';
export const CLONE_URL = `https://github.com/${REPOSITORY}.git`;

export function isPersonalOrigin(remote) {
  const value = String(remote || '').trim();
  const match = value.match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^?#]+)$/i);
  return Boolean(match && match[1].replace(/\.git$/i, '').toLowerCase() === REPOSITORY.toLowerCase());
}
