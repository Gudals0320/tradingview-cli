import CDP from 'chrome-remote-interface';

export const CDP_TIMEOUT_MS = Number(process.env.TV_CDP_TIMEOUT_MS ?? 15000);
if (!Number.isSafeInteger(CDP_TIMEOUT_MS) || CDP_TIMEOUT_MS < 100 || CDP_TIMEOUT_MS > 120000) {
  throw Object.assign(new Error('TV_CDP_TIMEOUT_MS must be an integer from 100 to 120000.'), { code: 'INVALID_CONFIG' });
}

// This bounds a request, not the native action it starts. Callers retain a
// recovery fence on timeout and must verify quiescence before another mutation.
export async function deadline(action, { timeout = CDP_TIMEOUT_MS, label = 'CDP request' } = {}) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(action),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error(`${label} timed out after ${timeout}ms; execution may continue.`), {
          code: 'CDP_TIMEOUT', recovery_required: true,
        })), timeout);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export function boundClient(client) {
  const domains = new Map();
  return new Proxy(client, {
    get(target, name) {
      const value = Reflect.get(target, name);
      if (typeof value === 'function') {
        if (name === 'close') return async (...args) => {
          try { return await deadline(() => value.apply(target, args), { label: 'CDP.close' }); }
          catch (error) { target._ws?.terminate?.(); throw error; }
        };
        return (...args) => deadline(() => value.apply(target, args), { label: `CDP.${String(name)}` });
      }
      if (!value || typeof value !== 'object' || !/^[A-Z]/.test(String(name))) return value;
      if (!domains.has(name)) domains.set(name, new Proxy(value, {
        get(domain, method) {
          const action = domain[method];
          return typeof action === 'function'
            ? (...args) => deadline(() => action.apply(domain, args), { label: `CDP.${String(name)}.${String(method)}` }) : action;
        },
      }));
      return domains.get(name);
    },
  });
}

export default async function boundedCDP(options) {
  let expired = false;
  const pending = CDP(options);
  pending.then(client => { if (expired) { client._ws?.terminate?.(); } }, () => {});
  try { return boundClient(await deadline(() => pending, { label: 'CDP connect' })); }
  catch (error) { expired = true; throw error; }
}
for (const name of ['List', 'Version', 'Activate', 'Close', 'New']) {
  boundedCDP[name] = (...args) => deadline(() => CDP[name](...args), { label: `CDP.${name}` });
}
