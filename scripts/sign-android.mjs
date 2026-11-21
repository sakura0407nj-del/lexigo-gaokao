// Signing is deliberately local: private keys never enter GitHub Actions or the public repo.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const javaDir=process.env.LEXIGO_JAVA_DIR;
if(!javaDir)throw new Error('Set LEXIGO_JAVA_DIR to the directory containing java and keytool');
const bin=name=>path.join(javaDir,`${name}${process.platform==='win32'?'.exe':''}`);
const signingDir=process.env.LEXIGO_SIGNING_DIR||path.join(os.homedir(),'.codex','private-artifacts','lexigo-android');
fs.mkdirSync(signingDir,{recursive:true,mode:0o700});
const configPath=path.join(signingDir,'signing-private.json');
const keystore=path.join(signingDir,'lexigo-release.p12');
let config;
if(fs.existsSync(configPath))config=JSON.parse(fs.readFileSync(configPath,'utf8'));
else{
 if(fs.existsSync(keystore))throw new Error('Existing keystore has no password record. Restore the matching private backup; do not replace its signing identity.');
 config={alias:'lexigo-release',password:crypto.randomBytes(36).toString('base64url')};
 fs.writeFileSync(configPath,JSON.stringify(config),{mode:0o600,flag:'wx'});
}
const env={...process.env,LEXIGO_KEY_PASSWORD:config.password};
if(!fs.existsSync(keystore)){
 execFileSync(bin('keytool'),['-genkeypair','-keystore',keystore,'-storetype','PKCS12','-alias',config.alias,'-storepass:env','LEXIGO_KEY_PASSWORD','-keypass:env','LEXIGO_KEY_PASSWORD','-keyalg','RSA','-keysize','3072','-sigalg','SHA256withRSA','-validity','10000','-dname','CN=LexiGo Learning, OU=Android, O=LexiGo, C=CN','-noprompt'],{env,stdio:'pipe'});
}
const certPath=path.join(signingDir,'release-certificate.pem');
execFileSync(bin('keytool'),['-exportcert','-rfc','-keystore',keystore,'-storepass:env','LEXIGO_KEY_PASSWORD','-alias',config.alias,'-file',certPath],{env,stdio:'pipe'});
const certificateSha256=new crypto.X509Certificate(fs.readFileSync(certPath)).fingerprint256;
if(process.argv.includes('--prepare'))console.log(JSON.stringify({prepared:true,privateKeyPublished:false,certificateSha256}));
else{
 const [unsigned,jar,output]=process.argv.slice(2);
 if(!unsigned||!jar||!output)throw new Error('Usage: sign-android.mjs unsigned.apk apksigner.jar output.apk');
 fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
 execFileSync(bin('java'),['-jar',path.resolve(jar),'sign','--ks',keystore,'--ks-key-alias',config.alias,'--ks-pass','env:LEXIGO_KEY_PASSWORD','--key-pass','env:LEXIGO_KEY_PASSWORD','--min-sdk-version','26','--v1-signing-enabled','false','--v2-signing-enabled','true','--v3-signing-enabled','true','--v4-signing-enabled','false','--out',path.resolve(output),path.resolve(unsigned)],{env,stdio:'pipe'});
 const verification=execFileSync(bin('java'),['-jar',path.resolve(jar),'verify','--verbose','--print-certs',path.resolve(output)],{encoding:'utf8',stdio:'pipe'});
 if(!verification.includes('Verified using v2 scheme (APK Signature Scheme v2): true')||!verification.includes('Number of signers: 1'))throw new Error('APK signature verification did not confirm the expected signer');
 const bytes=fs.readFileSync(output);
 const report={package:'app.lexigo.learning',version:'1.0.0',minAndroid:'8.0',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),certificateSha256,verified:true,verification};
 fs.writeFileSync(`${output}.verification.json`,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,verification:undefined}));
}
