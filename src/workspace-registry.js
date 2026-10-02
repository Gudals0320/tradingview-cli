import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sessionPaths, withAdmissionGate } from './session.js';
import { loadWorkspace, workspaceError } from './workspace-store.js';
import { secureDirectory } from './private-store.js';

function registryPath(options) { const p = sessionPaths(options); return join(p.directory, `${p.key}.names.json`); }
function registry(options) {
  const path = registryPath(options);
  if (!existsSync(path)) return { schema: 1, names: {} };
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (value.schema !== 1 || !value.names || Array.isArray(value.names)) throw workspaceError('OWNERSHIP_UNREADABLE', 'Workspace name registry is malformed.');
  return value;
}
export function resolveWorkspace(reference, options = {}) {
  if (!reference) throw workspaceError('WORKSPACE_REQUIRED', 'Select a workspace with the PowerShell module or pass --workspace NAME. Prepare a saved layout, then tv workspace create NAME --layout ID.');
  const row = registry(options).names[reference], file = existsSync(resolve(reference));
  if (row && file) throw workspaceError('WORKSPACE_REFERENCE_AMBIGUOUS', 'Reference matches both a name and a file. Use an absolute handle path or a different name.');
  if (row) {
    const workspace = loadWorkspace(row.file, options);
    if (workspace.id !== row.id || workspace.layout !== row.layout) throw workspaceError('WORKSPACE_OWNERSHIP_LOST', 'Named workspace identity changed.');
    return workspace.file;
  }
  if (file) {
    process.stderr.write('Deprecated workspace file reference; register it with tv workspace import NAME --file PATH.\n');
    return loadWorkspace(resolve(reference), options).file;
  }
  throw workspaceError('WORKSPACE_NOT_FOUND', 'No workspace name or handle matches the reference. Use tv workspace list.');
}
export function registerWorkspaceName(name, file, options = {}) {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name || '')) throw workspaceError('WORKSPACE_NAME_INVALID', 'Use a name starting with a letter, followed by up to 63 letters, digits, underscores or hyphens.');
  const workspace = loadWorkspace(file, options);
  return withAdmissionGate(options, () => {
    const value = registry(options);
    if (Object.hasOwn(value.names, name)) throw workspaceError('WORKSPACE_NAME_EXISTS', 'Workspace name already exists.');
    value.names[name] = { id: workspace.id, file: workspace.file, layout: workspace.layout, created_at: new Date().toISOString() };
    const path = registryPath(options), temporary = `${path}.${randomUUID()}.tmp`;
    secureDirectory(sessionPaths(options).directory);
    writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 }); renameSync(temporary, path);
    return { success: true, name, workspace_id: workspace.id, layout: workspace.layout, file: workspace.file };
  });
}
export function listWorkspaceNames(options = {}) {
  return { success: true, workspaces: Object.entries(registry(options).names).map(([name, value]) => ({ name, ...value })) };
}
export function selectWorkspace(name, options = {}) {
  const file = resolveWorkspace(name, options), workspace = loadWorkspace(file, options);
  return { success: true, name, workspace_id: workspace.id, layout: workspace.layout, generation: workspace.binding?.nonce || null,
    selection_scope: 'calling-terminal', powershell_module_required: true };
}
