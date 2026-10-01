/** Physical EOL canonicalization for compilation identity only. */
export function canonicalPineSource(source) { return source.replace(/\r\n/g, '\n'); }
