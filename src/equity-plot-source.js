/** Conservative source attestation; runtime semantic checks remain mandatory. */
export function attestEquityPlot(source,plotId,metadata){
  const tokens=[];let i=0;
  while(i<source.length){
    const c=source[i];if(/\s/.test(c)){i++;continue;}
    if(source.slice(i,i+2)==='//'){const end=source.indexOf('\n',i);i=end<0?source.length:end;continue;}
    if(source.slice(i,i+2)==='/*')return {verified:false,reason:'Unsupported comment syntax'};
    if(c==='"'||c==="'"){const quote=c;let value='',closed=false;i++;while(i<source.length){if(source[i]==='\\'){value+=source.slice(i,i+2);i+=2;}else if(source[i]===quote){i++;closed=true;break;}else value+=source[i++];}if(!closed)return {verified:false,reason:'Unterminated literal'};tokens.push({kind:'string',value});continue;}
    const identifier=source.slice(i).match(/^[A-Za-z_][A-Za-z_0-9]*/);if(identifier){tokens.push({kind:'identifier',value:identifier[0]});i+=identifier[0].length;continue;}
    const number=source.slice(i).match(/^\d+(?:\.\d+)?/);if(number){tokens.push({kind:'number',value:number[0]});i+=number[0].length;continue;}
    tokens.push({kind:'punctuation',value:c});i++;
  }
  const calls=[];
  for(let t=0;t<tokens.length;t++){
    const token=tokens[t];
    if(token.kind!=='identifier'||tokens[t+1]?.value!=='(')continue;
    if(['plotshape','plotchar','plotarrow','plotbar','plotcandle','hline'].includes(token.value))return {verified:false,reason:'Unsupported native plot mapping'};
    if(token.value!=='plot')continue;
    if(tokens[t-1]?.value==='.')return {verified:false,reason:'Method plot mapping unsupported'};
    let depth=1,end=t+2;const args=[[]];
    for(;end<tokens.length&&depth;end++){const next=tokens[end];if(next.value==='('||next.value==='[')depth++;if(next.value===')'||next.value===']')depth--;if(!depth)break;if(next.value===','&&depth===1)args.push([]);else args.at(-1).push(next);}
    if(depth)return {verified:false,reason:'Unclosed plot call'};
    calls.push(args);t=end;
  }
  const match=/^plot_(\d+)$/.exec(plotId||''),plots=metadata?.plots;
  if(!match||!Array.isArray(plots)||plots.length!==calls.length||plots.some((plot,index)=>plot.id!=='plot_'+index||plot.type!=='line'))return {verified:false,reason:'Compiled plot order is unsupported'};
  const args=calls[Number(match[1])];if(!args)return {verified:false,reason:'Plot ID absent'};
  const first=args[0].map(token=>token.value);
  if(first.length!==3||args[0][0].kind!=='identifier'||args[0][1].kind!=='punctuation'||args[0][2].kind!=='identifier'||first.join(' ')!=='strategy . equity')return {verified:false,reason:'Require a direct plot(strategy.equity) expression'};
  let offset=0;
  for(const argument of args.slice(1)){
    if(argument[1]?.value!=='=')return {verified:false,reason:'Use named optional plot arguments'};
    if(argument[0]?.value==='offset'){
      const text=argument.slice(2).map(t=>t.value).join('');if(!/^-?\d+$/.test(text))return {verified:false,reason:'Dynamic offset unsupported'};offset=Number(text);
    }
  }
  return {verified:true,expression:'strategy.equity',plot_id:plotId,slot:Number(match[1])+1,offset,source_attestation:'auxiliary_static_direct_expression'};
}
