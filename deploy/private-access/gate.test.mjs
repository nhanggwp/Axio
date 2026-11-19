import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {createGate,hashPassword,safeNext} from './gate.mjs';
const password='test-only-geometry-password',sessionSecret=randomBytes(32).toString('hex');
const passwordHash=await hashPassword(password);
async function fixture(t,overrides={}) {
 const origin='https://axio.example',config={origin,passwordHash,sessionSecret,...overrides},server=createGate(config);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const base='http://127.0.0.1:'+server.address().port;
 const request=(path,options={})=>fetch(base+path,{redirect:'manual',...options});
 const unlock=(value=password,next='/',headers={})=>request('/access/unlock',{method:'POST',headers:{origin,'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json',...headers},body:new URLSearchParams({password:value,next})});
 return {request,unlock,config};
}
test('unlock page is public, responsive, contains no password and uses fresh CSP nonces',async t=>{
 const {request}=await fixture(t),a=await request('/access?next=/huong-dan/'),html=await a.text(),b=await request('/access');
 assert.equal(a.status,200);assert.match(html,/Chào mừng/);assert.match(html,/autocomplete="current-password"/);assert.ok(!html.includes(password));assert.match(a.headers.get('cache-control'),/no-store/);assert.match(a.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.notEqual(a.headers.get('content-security-policy'),b.headers.get('content-security-policy'));assert.equal(a.headers.get('www-authenticate'),null);
});
test('wrong password stays locked; valid password issues a signed secure cookie',async t=>{
 const {request,unlock}=await fixture(t);assert.equal((await request('/check')).status,401);
 const bad=await unlock('wrong');assert.equal(bad.status,401);assert.equal(bad.headers.get('set-cookie'),null);
 const good=await unlock(password,'/huong-dan/?lesson=13');assert.equal(good.status,200);assert.deepEqual(await good.json(),{redirect:'/huong-dan/?lesson=13'});
 const cookie=good.headers.get('set-cookie');for(const flag of ['__Host-axio-access=','HttpOnly','Secure','SameSite=Lax','Path=/'])assert.ok(cookie.includes(flag));
 assert.equal((await request('/check',{headers:{Cookie:cookie.split(';')[0]}})).status,204);
 const [name,value]=cookie.split(';')[0].split('=');assert.equal((await request('/check',{headers:{Cookie:name+'='+value.slice(0,-3)+'xyz'}})).status,401);
 assert.equal((await request('/check',{headers:{Cookie:name+'=unsigned.fake'}})).status,401);
});
test('expired signed cookies cannot unlock',async t=>{
 const {request}=await fixture(t);const body=Buffer.from(JSON.stringify({v:1,exp:1,revision:'fake'})).toString('base64url'),sig=createHmac('sha256',Buffer.from(sessionSecret,'hex')).update(body).digest('base64url');
 assert.equal((await request('/check',{headers:{Cookie:'__Host-axio-access='+body+'.'+sig}})).status,401);
});
test('credentials and sessions are not accepted from cross-site requests or query strings',async t=>{
 const {request,unlock}=await fixture(t);assert.equal((await unlock(password,'/',{origin:'https://attacker.example'})).status,403);assert.equal((await unlock(password,'/',{'sec-fetch-site':'cross-site'})).status,403);
 assert.equal((await request('/access/unlock?password='+password)).status,404);assert.equal((await request('/check?password='+password)).status,401);
});
test('redirects remain on Axio and cannot re-enter the access routes',()=>{
 for(const next of ['https://evil.example','//evil.example','/\\evil.example','/access','/access/unlock','/x\nLocation: evil','/_axio_access_check','/%5c%5cevil.example','/%2fevil.example','/%61ccess','/%ZZ'])assert.equal(safeNext(next),'/');
 assert.equal(safeNext('/huong-dan/?topic=space#13'),'/huong-dan/?topic=space#13');
});
test('failed attempts are rate limited',async t=>{
 const {unlock}=await fixture(t);for(let i=0;i<8;i++)assert.equal((await unlock('bad')).status,401);const limited=await unlock();assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
});
test('browser form fallback redirects and lock clears its cookie',async t=>{
 const {request,unlock}=await fixture(t);const good=await unlock(password,'/huong-dan/',{Accept:'text/html'});assert.equal(good.status,303);assert.equal(good.headers.get('location'),'/huong-dan/');
 const locked=await request('/access/lock',{method:'POST',headers:{origin:'https://axio.example','Content-Type':'application/x-www-form-urlencoded'},body:'next=%2F'});assert.equal(locked.status,303);assert.match(locked.headers.get('set-cookie'),/Max-Age=0/);
});
test('denied navigation redirects with an encoded return URL, while API calls receive 401',async t=>{
 const {request}=await fixture(t);const page=await request('/denied',{headers:{Accept:'text/html','X-Axio-Original-Uri':'/huong-dan/?x=1&y=2','X-Axio-Original-Method':'GET'}});assert.equal(page.status,303);assert.equal(new URL(page.headers.get('location'),'https://axio.example').searchParams.get('next'),'/huong-dan/?x=1&y=2');
 const api=await request('/denied',{headers:{Accept:'application/json','X-Axio-Original-Uri':'/api/status'}});assert.equal(api.status,401);assert.equal(api.headers.get('www-authenticate'),null);
});
test('password rotation invalidates existing cookies',async t=>{
 const one=await fixture(t),good=await one.unlock(),cookie=good.headers.get('set-cookie').split(';')[0];const two=await fixture(t,{passwordHash:await hashPassword('changed')});assert.equal((await two.request('/check',{headers:{Cookie:cookie}})).status,401);
});
test('service starts when its entry point is reached through a release symlink',async t=>{
 const {mkdtemp,symlink,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {fileURLToPath}=await import('node:url');const {spawn}=await import('node:child_process');const {createServer}=await import('node:net');
 const directory=await mkdtemp(join(tmpdir(),'axio-access-')),probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const entry=join(directory,'gate.mjs'),config=join(directory,'config.json');await symlink(fileURLToPath(new URL('./gate.mjs',import.meta.url)),entry);await writeFile(config,JSON.stringify({origin:'https://axio.example',passwordHash,sessionSecret,port}),{mode:0o600});
 const child=spawn(process.execPath,[entry],{env:{...process.env,AXIO_ACCESS_CONFIG:config},stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',chunk=>error+=chunk);
 t.after(async()=>{child.kill();await new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);});await rm(directory,{recursive:true,force:true});});
 let ready=false;for(let i=0;i<60;i++){try{ready=(await fetch('http://127.0.0.1:'+port+'/health')).status===204;}catch{}if(ready)break;if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,50));}assert.equal(ready,true,error||'Service did not start through its symlink');
});
