import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// An earlier release produced a syntax error before React could show its boundary.
// Check the actual distributed chunks, including those loaded on navigation.
const K=ts.SyntaxKind;
const tooNew=new Set([K.QuestionDotToken,K.QuestionQuestionToken,K.QuestionQuestionEqualsToken,K.BarBarEqualsToken,K.AmpersandAmpersandEqualsToken,K.PrivateIdentifier]);
const jsFiles=readdirSync('dist-public/assets').filter(name=>name.endsWith('.js'));
assert.ok(jsFiles.length);
for(const name of jsFiles){
  const source=ts.createSourceFile(name,readFileSync('dist-public/assets/'+name,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  function visit(node){
    assert.ok(!tooNew.has(node.kind),name+' contains syntax unavailable to older WebViews: '+K[node.kind]);
    ts.forEachChild(node,visit);
  }
  visit(source);
}

const html=readFileSync('dist-public/index.html','utf8');
const script=readFileSync('dist-public/startup.js','utf8');
assert.match(html,/<script defer src="\/startup\.js"><\/script>/);
assert.match(html,/<section id="startup"/);
function startup(){
  const elements=new Map(),events={};
  let timer,cleared=false,reloaded=false;
  const document={getElementById(id){
    if(!elements.has(id))elements.set(id,{});
    return elements.get(id);
  }};
  vm.runInNewContext(script,{document,window:{addEventListener:(name,fn)=>{events[name]=fn;}},navigator:{userAgent:'Android Chrome/79.0'},location:{reload:()=>{reloaded=true;}},setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{cleared=true;}});
  return {elements,events,timeout:()=>timer(),cleared:()=>cleared,reloaded:()=>reloaded};
}
const slow=startup();
slow.timeout();
assert.equal(slow.elements.get('startup-help').open,true);
assert.match(slow.elements.get('startup-version').textContent,/79/);
slow.elements.get('startup-retry').onclick({preventDefault(){}});
assert.equal(slow.reloaded(),true);
const missing=startup();
missing.events.error({target:{tagName:'SCRIPT'}});
assert.match(missing.elements.get('startup-message').textContent,/下载/);
const ready=startup();
ready.elements.get('startup').hidden=true;
ready.events['lexigo-ready']();
assert.equal(ready.cleared(),true);
ready.events.error({message:'unrelated error after mounting'});
assert.equal(ready.elements.has('startup-help'),false);
console.log('Verified '+jsFiles.length+' browser bundles, the initial HTML, retry, script errors and late startup.');
