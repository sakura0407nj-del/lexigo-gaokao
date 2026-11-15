import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import netlify from '@netlify/vite-plugin';
import {fileURLToPath,URL} from 'node:url';
import {existsSync,readFileSync} from 'node:fs';
// Local development only; .dev.vars is ignored by Git and never bundled.
if(existsSync('.dev.vars'))for(const line of readFileSync('.dev.vars','utf8').split(/\r?\n/)){
  const m=/^([A-Z_][A-Z0-9_]*)=(.+)$/.exec(line);if(m&&!process.env[m[1]])try{process.env[m[1]]=JSON.parse(m[2]);}catch{process.env[m[1]]=m[2];}
}
export default defineConfig({plugins:[
  {name:'local-development-headers',enforce:'pre',configureServer(server){
    server.middlewares.use((req,_res,next)=>{req.headers['x-forwarded-for']=req.socket.remoteAddress||'127.0.0.1';next();});
    // Vite's HMR injects an inline preamble. Production keeps the strict CSP.
    // netlify/vite-plugin 3.0.1 does not forward its headers option to NetlifyDev.
    return ()=>{server.middlewares.use((_req,res,next)=>{res.removeHeader('Content-Security-Policy');next();});};
  }},
  react(),netlify({edgeFunctions:{enabled:false},database:{enabled:false},geolocation:{enabled:false},images:{enabled:false},headers:{enabled:false}})
],resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},build:{outDir:'dist-public',sourcemap:false},server:{host:'127.0.0.1',port:5178,strictPort:true}});
