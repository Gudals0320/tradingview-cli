import { createHash } from 'node:crypto';

// Run only after raw report identities/revisions and freshness guards are computed.
// This is a projection, never a mutation of the internal native evidence.
export function projectOutput(value, key = '') {
  if (Array.isArray(value)) return value.map(item => {
    if (['inputs', 'strategy_inputs'].includes(key) && item?.id === 'text') {
      const text = typeof item.value === 'string' ? item.value : JSON.stringify(item.value) ?? '';
      return { id: 'text', omitted: true, length: text.length, sha256: createHash('sha256').update(text).digest('hex') };
    }
    return projectOutput(item);
  });
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, projectOutput(item, name)]));
  return value;
}
