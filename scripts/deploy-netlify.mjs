import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
// Deploy only the independent LexiGo beta draft. No production deployment or paid upgrade.
// The private values are passed in memory and every error path redacts them.
const root=fileURLToPath(new URL('../',import.meta.url));
const siteId='916eafc6-a5f4-4f2d-9517-c1d9c85e4247';
const statePath=path.join(root,'.netlify/state.json');
if(!fs.existsSync(statePath))throw new Error('Link this checkout to the LexiGo Netlify site before deployment');
const state=JSON.parse(fs.readFileSync(statePath,'utf8'));
fs.mkdirSync(path.join(root,'work/deployment'),{recursive:true});
if(state.siteId!==siteId)throw new Error('Local project link does not match the authorized English site');
const values={};
for(const line of fs.readFileSync(path.join(root,'.dev.vars'),'utf8').split(/\r?\n/)){
 const m=/^(AI_API_KEY|AI_MODEL|AI_FALLBACK_MODEL|PAPER_SECRET)=(.+)$/.exec(line);
 if(!m)continue;
 try{values[m[1]]=JSON.parse(m[2])}catch{values[m[1]]=m[2]}
}
if(!values.AI_API_KEY||!values.PAPER_SECRET||values.PAPER_SECRET.length<24)throw new Error('Required private configuration is absent or incomplete');
const files=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else files.push(file)}}
const publish=path.join(root,'dist-public');if(!fs.existsSync(path.join(publish,'index.html')))throw new Error('Production frontend build is missing');walk(publish);
const privateValues=[values.AI_API_KEY,values.PAPER_SECRET].map(v=>Buffer.from(v));
const leaks=files.filter(file=>privateValues.some(value=>fs.readFileSync(file).includes(value)));
if(leaks.length)throw new Error('Private configuration detected in static build; deployment stopped');
if(process.argv.includes('--check')){console.log(JSON.stringify({ready:true,siteId,alias:'beta',staticFileCount:files.length,privateValuesInStaticBuild:0,secretKeys:['AI_API_KEY','PAPER_SECRET'],deployOnly:true,actualDeployment:false}));process.exit(0)}
const args=[path.join(root,'node_modules/netlify-cli/bin/run.js'),'deploy','--alias','beta','--site',siteId,'--no-build','--dir','dist-public','--functions','netlify/functions','--json'];
for(const [key,value]of Object.entries(values))args.push(key==='AI_API_KEY'||key==='PAPER_SECRET'?'--secret-env':'--env',`${key}=${value}`);
const run=promisify(execFile);
const safeText=value=>Object.values(values).filter(v=>typeof v==='string'&&v.length).reduce((text,secret)=>text.split(secret).join('[REDACTED]'),String(value||''));
try{
 const result=await run(process.execPath,args,{cwd:root,maxBuffer:16*1024*1024,timeout:300000});
 let parsed;const starts=[0,...Array.from(result.stdout.matchAll(/\n\{/g),match=>match.index+1)].reverse();
 for(const start of starts){try{parsed=JSON.parse(result.stdout.slice(start));break}catch{}}
 const safe={success:true,siteId,alias:'beta',deployId:parsed?.deploy_id,deployUrl:parsed?.deploy_url,siteUrl:parsed?.url,context:'draft',production:false,secretValuesPrinted:false};
 fs.writeFileSync(path.join(root,'work/deployment/beta-deploy-safe.json'),JSON.stringify(safe,null,2));
 console.log(JSON.stringify(safe));
}catch(error){
 const diagnostic=safeText(String(error.stdout||'')+'\n'+String(error.stderr||''));
 const safe={success:false,siteId,alias:'beta',exitCode:error.code??null,quotaRejected:/credit|quota|usage exceeded/i.test(diagnostic),scopeRejected:/scope|secret.*not allowed/i.test(diagnostic),safeDiagnostic:diagnostic.slice(-4500)};
 fs.writeFileSync(path.join(root,'work/deployment/beta-deploy-safe.json'),JSON.stringify(safe,null,2));console.log(JSON.stringify(safe));process.exitCode=1;
}
