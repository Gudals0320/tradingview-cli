import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sessionPaths, withAdmissionGate,readReservations } from './session.js';
import { loadWorkspace, workspaceError, importLegacyWorkspace } from './workspace-store.js';
import { secureDirectory } from './private-store.js';

function registryPath(options) { const p = sessionPaths(options); return join(p.directory, `${p.key}.names.json`); }
function saveRegistry(options,value) {
  const path=registryPath(options),temporary=`${path}.${randomUUID()}.tmp`;writeFileSync(temporary,JSON.stringify(value),{mode:0o600});renameSync(temporary,path);
}
function registry(options) {
  const path = registryPath(options);
  if (!existsSync(path)) return { schema: 1, names: {} };
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (value.schema !== 1 || !value.names || Array.isArray(value.names)) throw workspaceError('OWNERSHIP_UNREADABLE', 'Workspace name registry is malformed.');
  return value;
}
export function resolveWorkspace(reference, options = {}) {
  if (!reference) throw workspaceError('WORKSPACE_REQUIRED', 'Select a workspace with the PowerShell module or pass --workspace NAME. Prepare a saved layout, then tv workspace create NAME --layout ID.');
  const names=registry(options).names, row = Object.hasOwn(names,reference) ? names[reference] : null, file = existsSync(resolve(reference));
  if (row && file) throw workspaceError('WORKSPACE_REFERENCE_AMBIGUOUS', 'Reference matches both a name and a file. Use an absolute handle path or a different name.');
  if (row) {
    if (row.pending) throw workspaceError('WORKSPACE_PREPARING','Workspace name is reserved by an in-progress preparation.');
    const workspace = loadWorkspace(row.file, options);
    if (workspace.id !== row.id || workspace.layout !== row.layout) throw workspaceError('WORKSPACE_OWNERSHIP_LOST', 'Named workspace identity changed.');
    return workspace.file;
  }
  if (file) {
    return loadWorkspace(resolve(reference), options).file;
  }
  throw workspaceError('WORKSPACE_NOT_FOUND', 'No workspace name or handle matches the reference. Use tv workspace list.');
}
export function registerWorkspaceName(name, file, options = {}, reservationToken) {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name || '')) throw workspaceError('WORKSPACE_NAME_INVALID', 'Use a name starting with a letter, followed by up to 63 letters, digits, underscores or hyphens.');
  let workspace;
  try {workspace=loadWorkspace(file,options);}catch(cause){if(!['ENOENT','WORKSPACE_OWNERSHIP_LOST'].includes(cause.code))throw cause;workspace=importLegacyWorkspace(file,options);}
  secureDirectory(sessionPaths(options).directory);
  return withAdmissionGate(options, () => {
    const value = registry(options);
    const prior=Object.hasOwn(value.names,name)?value.names[name]:null;
    if (prior && !(prior.pending && prior.token===reservationToken) && prior.id !== workspace.id) throw workspaceError('WORKSPACE_NAME_EXISTS', 'Workspace name already exists.');
    value.names[name] = { id: workspace.id, file: workspace.file, layout: workspace.layout, created_at: new Date().toISOString() };
    const path = registryPath(options), temporary = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 }); renameSync(temporary, path);
    return { success: true, name, workspace_id: workspace.id, layout: workspace.layout, file: workspace.file };
  });
}
export function reserveWorkspaceName(name,options={}) {
  if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name||''))throw workspaceError('WORKSPACE_NAME_INVALID','Invalid workspace name.');
  const token=randomUUID();
  secureDirectory(sessionPaths(options).directory);
  withAdmissionGate(options,()=>{
    const value=registry(options);if(Object.hasOwn(value.names,name))throw workspaceError('WORKSPACE_NAME_EXISTS','Workspace name already exists.');
    value.names[name]={pending:true,token,pid:process.pid,process_started_at:new Date(Date.now()-process.uptime()*1000).toISOString(),file:options.file};
    saveRegistry(options,value);
  });
  return {token,cancel(){withAdmissionGate(options,()=>{const value=registry(options);if(value.names[name]?.token===token){delete value.names[name];saveRegistry(options,value);}});}};
}
export function recordCreatedLayout(result,options={}) {
  const paths=sessionPaths(options),path=join(paths.directory,`${paths.key}.created-layouts.json`);
  secureDirectory(paths.directory);
  return withAdmissionGate(options,()=>{const value=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):[];value.push({layout:result.chart_id,target:result.target,created_at:new Date().toISOString()});const temporary=`${path}.${randomUUID()}.tmp`;writeFileSync(temporary,JSON.stringify(value),{mode:0o600});renameSync(temporary,path);});
}
export function wasCreatedLayout(layout,target,options={}) {
  const paths=sessionPaths(options),path=join(paths.directory,`${paths.key}.created-layouts.json`);
  return existsSync(path)&&JSON.parse(readFileSync(path,'utf8')).some(row=>row.layout===layout&&row.target===target);
}
export function recordSavedLayoutCreation(result, options = {}) {
  const paths = sessionPaths(options), path = join(paths.directory, `${paths.key}.saved-layouts.json`);
  if (!result.success || !result.chart_id) throw workspaceError('LAYOUT_CREATION_UNVERIFIED', 'Saved-layout creation was not verified.');
  secureDirectory(paths.directory);
  return withAdmissionGate(options, () => { const rows = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
    rows.push({ layout: result.chart_id, created_at: new Date().toISOString() });
    const temp = `${path}.${randomUUID()}.tmp`; writeFileSync(temp, JSON.stringify(rows), { mode: 0o600 }); renameSync(temp, path);
  });
}
export function recordOwnedTab(result, options = {}) {
  const proof = result.tab_ownership;
  if (!result.success || !proof?.owned || proof.layout !== result.chart_id || proof.target !== result.target
    || !proof.browser_generation || !proof.proof?.new_tab_button || !proof.proof.target_absent_before || !proof.proof.shell_tab_id) return false;
  const paths = sessionPaths(options), path = join(paths.directory, `${paths.key}.owned-tabs.json`);
  secureDirectory(paths.directory);
  return withAdmissionGate(options, () => { const rows = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
    rows.push({ ...proof, created_at: new Date().toISOString() });
    const temp = `${path}.${randomUUID()}.tmp`; writeFileSync(temp, JSON.stringify(rows), { mode: 0o600 }); renameSync(temp, path); return true;
  });
}
export function ownedTabProof(layout, target, browser, options = {}) {
  const paths = sessionPaths(options), path = join(paths.directory, `${paths.key}.owned-tabs.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).find(row => row.owned && row.layout === layout && row.target === target && row.browser_generation === browser) || null : null;
}
export function listWorkspaceNames(options = {}) {
  const rows=readReservations(options);
  return { success: true, workspaces: Object.entries(registry(options).names).map(([name, value]) => {
    const row=rows.find(row=>row.id===value.id||row.file===value.file);
    return value.pending?{name,pending:true,pid:value.pid,file:value.file,workspace_id:row?.id||null,reservation_id:value.token}:{name,...value,state:row?row.interrupted?'interrupted':row.operation?'running':row.connection_state||'idle':'released'};
  }) };
}
export function workspaceNameRecord(name,options={}) {
  const names=registry(options).names;if(!Object.hasOwn(names,name))throw workspaceError('WORKSPACE_NOT_FOUND','Workspace name was not found.');return names[name];
}
export function forgetWorkspaceName(name,record,options={}) {
  return withAdmissionGate(options,()=>{const value=registry(options),current=value.names[name];if(!current||current.file!==record.file||current.id!==record.id||current.token!==record.token||current.pid!==record.pid||current.process_started_at!==record.process_started_at)throw workspaceError('WORKSPACE_OWNERSHIP_LOST','Name identity changed during reset.');delete value.names[name];saveRegistry(options,value);});
}
export function selectWorkspace(name, options = {}) {
  const file = resolveWorkspace(name, options), workspace = loadWorkspace(file, options);
  return { success: true, name, workspace_id: workspace.id, layout: workspace.layout, generation: workspace.binding?.nonce || null,
    selection_scope: 'calling-terminal', selection_applied: false, powershell_module_required: true };
}
