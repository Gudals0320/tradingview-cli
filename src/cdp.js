import CDP from 'chrome-remote-interface';
import Chrome from 'chrome-remote-interface/lib/chrome.js';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';

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

function debuggerRequest(path, options, signal, { method = 'GET', json = true } = {}) {
  return new Promise((resolve, reject) => {
    const transport = options.secure ? https : http;
    const request = transport.request({ host: options.host || 'localhost', port: options.port || 9222,
      path: options.alterPath ? options.alterPath(path) : path, method, signal, agent: false }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('error', reject);
      response.on('aborted', () => reject(new Error('CDP discovery response aborted.')));
      response.on('end', () => {
        if (response.statusCode !== 200) { reject(new Error(`CDP discovery HTTP ${response.statusCode}`)); return; }
        try { resolve(json ? JSON.parse(body) : undefined); } catch (error) { reject(error); }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

async function debuggerURL(options, signal) {
  const target = options.target;
  if (typeof target === 'string' && /^wss?:/i.test(target)) return target;
  if (typeof target === 'string' && target.startsWith('/')) return `ws://${options.host || 'localhost'}:${options.port || 9222}${target}`;
  if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
  const targets = await debuggerRequest('/json/list', options, signal);
  let selected;
  if (typeof target === 'function') { selected = target(targets); if (typeof selected === 'number') selected = targets[selected]; }
  else if (target) selected = targets.find(item => item.id === (target.id || target));
  else selected = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl)
    || targets.filter(item => item.webSocketDebuggerUrl).at(-1);
  if (!selected?.webSocketDebuggerUrl) throw new Error('Requested CDP target is not inspectable.');
  return selected.webSocketDebuggerUrl;
}

export default async function boundedCDP(options = {}) {
  const cancellation = new AbortController();
  let client;
  try {
    return await deadline(async () => {
      const target = await debuggerURL(options, cancellation.signal);
      const address = new URL(target);
      const protocol = options.protocol || (options.local ? await CDP.Protocol({ local: true })
        : await debuggerRequest('/json/protocol', { ...options, host: address.hostname, port: address.port || options.port,
          secure: options.secure || address.protocol === 'wss:' }, cancellation.signal));
      cancellation.signal.throwIfAborted();
      const connected = new Promise((resolve, reject) => {
        const notifier = new EventEmitter();
        notifier.once('connect', resolve);
        notifier.on('error', reject);
        // CRI's Promise API hides this instance until upgrade completes. Own it
        // from construction so a CONNECTING WebSocket can also be terminated.
        client = new Chrome({ ...options, target, protocol }, notifier);
      });
      return boundClient(await connected);
    }, { label: 'CDP connect' });
  } catch (error) {
    cancellation.abort(error); // destroys discovery/protocol requests too
    // Reset the owned handshake socket even if a raw peer never drains the
    // Upgrade request. A FIN alone can leave that peer's socket half-open.
    try { client?._ws?._req?.socket?.resetAndDestroy?.(); } catch { /* Preserve the connect error. */ }
    try { client?._ws?.terminate?.(); } catch { /* Preserve the connect error. */ }
    throw error;
  }
}
for (const name of ['List', 'Version', 'Activate', 'Close', 'New']) {
  boundedCDP[name] = async (options = {}) => {
    const cancellation = new AbortController();
    const path = name === 'List' ? '/json/list' : name === 'Version' ? '/json/version'
      : name === 'New' ? `/json/new${options.url ? `?${options.url}` : ''}` : `/json/${name.toLowerCase()}/${options.id}`;
    try { return await deadline(() => debuggerRequest(path, options, cancellation.signal,
      { method: options.method || (name === 'New' ? 'PUT' : 'GET'), json: !['Activate', 'Close'].includes(name) }), { label: `CDP.${name}` }); }
    catch (error) { cancellation.abort(error); throw error; }
  };
}
