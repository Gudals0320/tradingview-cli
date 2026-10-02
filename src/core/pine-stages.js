// Node orchestration seams are named so tests do not parse generated JavaScript.
export function inspectPineStage(deps, inspect, name, expression, parameters = {}) {
  const callback = deps?.stages?.[name];
  if (callback) return callback(parameters);
  const { token: _token, finish: _finish, error: _error, code: _code, ...options } = parameters;
  return inspect(expression, options);
}

export async function waitForAppliedIndicator(context, { inspect, sleep, now, timeout }) {
  const start = now();
  do { await sleep(200); context = await inspect(); }
  while (context.pending && now() - start < timeout);
  return context;
}
