import {it} from 'node:test';
import assert from 'node:assert/strict';
import {check,smartCompile} from '../src/core/pine.js';
import {pineDeclaration,libraryTitleDiagnostic} from '../src/pine-source.js';

it('validates deterministic library titles, preserving diagnostic location',()=>{
  for(const title of ['Bad Title','9Bad','Bad-Title','한국어','']){
    const r=libraryTitleDiagnostic(`//@version=6\nlibrary("${title}")`);assert.equal(r.code,'INVALID_LIBRARY_TITLE');assert.equal(r.line,2);assert.equal(r.column,9);
  }
  assert.equal(libraryTitleDiagnostic('library("_Valid_13")'),null);
  assert.equal(libraryTitleDiagnostic('library(dynamicTitle)'),null);
  assert.equal(pineDeclaration('// library("Fake")\nindicator("URL http://a")').kind,'indicator');
});
it('bad library titles fail local check before calling the light facade',async()=>{
  let calls=0;const r=await check({source:'library("Bad Title")',_deps:{fetch:()=>{calls++;}}});
  assert.equal(r.compiled,false);assert.equal(r.validation_scope,'local_library_title');assert.equal(calls,0);
});
it('valid library light checks declare their limited validation scope',async()=>{
  const r=await check({source:'library("Valid")\nexport f(float x)=>x',_deps:{fetch:async()=>({ok:true,json:async()=>({result:{}})})}});
  assert.equal(r.compiled,true);assert.equal(r.validation_scope,'light_server_translation');assert.equal(r.desktop_validated,false);
});
it('library chart application is rejected before native dispatch or study creation',async()=>{
  let native=0;const r=await smartCompile({_deps:{source:'library("Valid")\nexport f(float x)=>x',readOutcome:async()=>({markers:[],targets:[]}),
    evaluate:expression=>{if(expression.includes('return failCompilation('))return false;native++;throw new Error('must not dispatch');}}});
  assert.equal(r.code,'LIBRARY_NOT_APPLICABLE');assert.equal(r.compile_performed,false);assert.equal(r.chart_changed,false);assert.equal(native,0);
});
