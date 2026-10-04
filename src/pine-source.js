/** Monaco physical EOL canonicalization; preserve every other character. */
export function canonicalPineSource(source) { return source.replace(/\r\n?|\n/g, '\n'); }

export function pineDeclaration(source) {
  const code=source.replace(/("(?:\\[^\r\n]|[^"\\\r\n])*"|'(?:\\[^\r\n]|[^'\\\r\n])*')|\/\/[^\r\n]*/g,
    (text,literal)=>literal?text:' '.repeat(text.length));
  const match=code.match(/^\s*(indicator|strategy|library)\s*\(/m);
  if(!match)return {kind:'unknown'};
  const start=match.index+match[0].lastIndexOf(match[1]);
  const literal=code.slice(start).match(/^(?:indicator|strategy|library)\s*\(\s*(?:title\s*=\s*)?("(?:\\[^\r\n]|[^"\\\r\n])*"|'(?:\\[^\r\n]|[^'\\\r\n])*')/);
  const title=literal?.[1]?.slice(1,-1);
  const offset=literal?start+literal[0].lastIndexOf(literal[1]):null;
  return {kind:match[1],title,line:offset===null?null:source.slice(0,offset).split('\n').length,
    column:offset===null?null:offset-source.lastIndexOf('\n',offset-1)};
}

export function libraryTitleDiagnostic(source) {
  const declaration=pineDeclaration(source);
  if(declaration.kind!=='library'||declaration.title===undefined||declaration.title.includes('\\'))return null;
  if(/^[A-Za-z_][A-Za-z0-9_]*$/.test(declaration.title))return null;
  return {line:declaration.line,column:declaration.column,severity:8,code:'INVALID_LIBRARY_TITLE',
    message:'Library title must begin with an ASCII letter or underscore and contain only ASCII letters, digits, or underscores.'};
}
