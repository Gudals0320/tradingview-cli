/**
 * Core screenshot/capture logic.
 */
import { getClient, evaluate, getChartCollection } from '../connection.js';
import { readChartContext } from '../chart-context.js';
import { waitForChartRender } from '../wait.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(dirname(dirname(__dirname)), 'screenshots');

export function safeFilename(value) {
  const name = String(value).replace(/[^\p{L}\p{N}_.-]/gu, '_').replace(/\.\./g, '_').replace(/[. ]+$/g, '');
  if (!name || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) throw new Error('Invalid or reserved screenshot filename.');
  return name;
}

/** Runs on the owned foreground page; records what the old selector chain actually chose. */
export function captureRegionMetadata(window,document,region) {
  const selectors = region === 'chart' ? ['[data-name="pane-canvas"]','[class*="chart-container"]','canvas']
    : region === 'strategy_tester' ? ['[data-name="backtesting"]','[class*="strategyReport"]'] : [];
  let selected=null,selector=null,index=-1;
  for(let i=0;i<selectors.length;i++){const el=document.querySelector(selectors[i]);if(el){selected=el;selector=selectors[i];index=i;break;}}
  const rect=selected?.getBoundingClientRect();
  const valid=rect && [rect.x,rect.y,rect.width,rect.height].every(Number.isFinite) && rect.width>0 && rect.height>0;
  const clip=valid?{x:rect.x+(window.scrollX||0),y:rect.y+(window.scrollY||0),width:rect.width,height:rect.height,scale:1}:null;
  let pane=null;
  try{const node=selected?.closest?.('[data-name="pane"], [data-pane-id]');pane=node?.getAttribute?.('data-pane-id')??node?.id??null;}catch{/* Unknown. */}
  let matchedCount=null,visibleCount=null;
  if(selector && typeof document.querySelectorAll==='function'){
    const matches=Array.from(document.querySelectorAll(selector));matchedCount=matches.length;
    visibleCount=matches.filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;}).length;
  }
  return {requested_region:region,actual_region:clip?'dom_element':'viewport',
    selector_used:selector,selector_index:index<0?null:index,
    matched_element_count:matchedCount,visible_match_count:visibleCount,selected_match_index:selector?0:null,
    region_coverage:clip?(matchedCount>1?'first_match_only':matchedCount===1?'selected_element':'unknown'):'viewport',
    fallback:selectors.length && !clip?'full_page':index>0?'alternate_selector':null,
    fallback_used:Boolean(selectors.length && (!clip || index>0)),pane_id:pane,
    clip,coordinate_system:'page_css_pixels',device_pixel_ratio:Number.isFinite(window.devicePixelRatio)?window.devicePixelRatio:null,
    viewport:{width:window.innerWidth??null,height:window.innerHeight??null,scroll_x:window.scrollX||0,scroll_y:window.scrollY||0},
    axes_included:'unknown',requested_region_verified:region==='full'?true:'unknown'};
}

export async function captureScreenshot({ region = 'full', filename, method, waitForRender = false, _deps = {} } = {}) {
  if(method!==undefined&&!['cdp','api'].includes(method))throw new Error('Screenshot method must be cdp or api.');
  if(!['full','chart','strategy_tester'].includes(region))throw new Error('Screenshot region must be full, chart or strategy_tester.');
  const inspect=_deps.evaluate||evaluate;
  if (waitForRender) await (_deps.waitForChartRender||waitForChartRender)();
  if (method === 'api') {
    try {
      const colPath = await (_deps.getChartCollection||getChartCollection)();
      await inspect(`${colPath}.takeScreenshot()`,{mutation:true});
      return {success:true,method:'api',backend:'api',source:'owned_chart_collection_api',file_path:null,
        requested_region:region,actual_region:'unknown',region,pane_id:null,clip:null,coordinate_system:null,
        selector_used:null,fallback:null,fallback_used:false,axes_included:'unknown',requested_region_verified:'unknown',
        matched_element_count:null,visible_match_count:null,selected_match_index:null,region_coverage:'unknown',
        device_pixel_ratio:null,image_pixels:null,waited_for_render:!!waitForRender,
        note:'takeScreenshot() triggered — TradingView will save/show the screenshot via its own UI; file creation and region are unverified'};
    } catch(cause) {
      throw Object.assign(new Error('Owned chart screenshot API failed; no hidden-tab CDP fallback was attempted.'),{code:'SCREENSHOT_API_UNAVAILABLE',cause});
    }
  }
  const metadata=await inspect(`(() => {
    const capture = ${captureRegionMetadata.toString()}, read = ${readChartContext.toString()};
    let context=null;try{context=read(window);}catch{/* Metadata can be partially unknown. */}
    return {...capture(window,document,${JSON.stringify(region)}),chart_context:context};
  })()`);
  if(!metadata)throw Object.assign(new Error('Capture region metadata unavailable.'),{code:'CAPTURE_METADATA_UNAVAILABLE'});
  const client = await (_deps.getClient||getClient)();
  const params={format:'png',...(metadata.clip?{clip:metadata.clip}:{})};
  const {data}=await client.Page.captureScreenshot(params);
  const png=Buffer.from(data,'base64');
  const image_pixels=png.length>=24 && png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    ? {width:png.readUInt32BE(16),height:png.readUInt32BE(20)} : null;
  const ts=new Date().toISOString().replace(/[:.]/g,'-');
  const fname=safeFilename(filename||`tv_${region}_${ts}`),filePath=join(SCREENSHOT_DIR,`${fname}.png`);
  if(_deps.writeFile)_deps.writeFile(filePath,png);
  else {mkdirSync(SCREENSHOT_DIR,{recursive:true});writeFileSync(filePath,png);}
  return {success:true,method:'cdp',backend:'cdp',source:metadata.clip?'dom_crop':'page_viewport',file_path:filePath,region,
    ...metadata,image_pixels,waited_for_render:!!waitForRender,size_bytes:png.length};
}
