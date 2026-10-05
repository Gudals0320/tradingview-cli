import {existsSync,openSync,writeFileSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';

export function prepareEquityExport(file){
  if(typeof file!=='string'||!file.trim()||file.includes('\0'))throw Object.assign(new Error('Require a nonempty CSV output path.'),{code:'INVALID_EQUITY_REQUEST'});
  const path=resolve(file);if(existsSync(path))throw Object.assign(new Error('Equity CSV destination already exists; choose a new file.'),{code:'EQUITY_EXPORT_EXISTS',details:{path}});
  return path;
}

/** Called only after workspace observation and cleanup have completed. */
export function writeEquityExport(result,file){
  const {_export_rows:rows,...publicResult}=result;
  if(!result.success)return publicResult;
  if(!Array.isArray(rows)||rows.length!==result.total_points)throw Object.assign(new Error('Validated full equity snapshot is missing; no file was written.'),{code:'EQUITY_EXPORT_UNVERIFIED'});
  const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  const columns=['bar_index','time','equity','currency','render_offset','plot_id','source_hash','report_revision'];
  const csv=columns.join(',')+'\r\n'+rows.map(row=>[row.bar_index,row.time,row.equity,result.currency,row.render_offset,result.plot_id,result.source_hash,result.report_revision].map(quote).join(',')).join('\r\n')+'\r\n';
  const path=prepareEquityExport(file);let handle;
  try{handle=openSync(path,'wx',0o600);writeFileSync(handle,csv,'utf8');}
  catch(error){throw Object.assign(error,{code:error.code==='EEXIST'?'EQUITY_EXPORT_EXISTS':'EQUITY_EXPORT_WRITE_FAILED',details:{path,partial_file_possible:handle!==undefined,report_revision:result.report_revision}});}
  finally{if(handle!==undefined)closeSync(handle);}
  return {...publicResult,export:{path,format:'csv',rows:rows.length,coverage:'all validated loaded chart bars',report_revision:result.report_revision,complete_loaded_snapshot:true,downsampled:false}};
}
