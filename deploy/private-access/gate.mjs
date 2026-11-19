import http from 'node:http';
import {createHmac,randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {readFileSync,realpathSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {page} from './page.mjs';
const scrypt=promisify(scryptCallback),COOKIE='__Host-axio-access',ENTRY='__Host-axio-entry',MAX_AGE=12*60*60;
export async function hashPassword(password,salt=randomBytes(24).toString('hex')) {
 const key=await scrypt(password,salt,64);return `scrypt:${salt}:${key.toString('hex')}`;
}
export function safeNext(value) {
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u0020\u007f]/.test(value))return '/';
 try {const url=new URL(value,'https://axio.invalid');const decoded=decodeURIComponent(url.pathname);if(url.origin!=='https://axio.invalid'||decoded.startsWith('//')||decoded.includes('\\')||/[\u0000-\u001f\u007f]/.test(decoded)||decoded.startsWith('/access')||decoded.startsWith('/_axio_'))return '/';return url.pathname+url.search+url.hash;}catch{return '/';}
}
export function createGate(config) {
 const origin=new URL(config.origin).origin,secret=Buffer.from(config.sessionSecret,'hex');
 const [algorithm,salt,hash]=String(config.passwordHash).split(':');
 if(algorithm!=='scrypt'||!/^[a-f0-9]{48}$/.test(salt)||!/^[a-f0-9]{128}$/.test(hash)||secret.length<32)throw Error('Invalid private access configuration');
 const expected=Buffer.from(hash,'hex'),revision=createHash('sha256').update(config.passwordHash).digest('hex').slice(0,24),attempts=new Map(),entries=new Map();
 const secureCookie=config.secureCookie!==false;
 if(!secureCookie&&new URL(origin).hostname!=='127.0.0.1'&&new URL(origin).hostname!=='localhost')throw Error('Insecure cookies are only allowed on localhost');
 const cookieName=secureCookie?COOKIE:'axio-access-development';
 const entryName=secureCookie?ENTRY:'axio-entry-development';
 const readCookie=(req,name)=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
 const sign=value=>createHmac('sha256',secret).update(value).digest('base64url');
 const issue=()=>{const body=Buffer.from(JSON.stringify({v:2,exp:Date.now()+MAX_AGE*1000,revision,nonce:randomBytes(16).toString('hex')})).toString('base64url');return body+'.'+sign(body);};
 function valid(req) {
  const token=readCookie(req,cookieName);
  if(!token||token.length>1024)return false;
  const [body,signature,extra]=token.split('.');if(!body||!signature||extra)return false;
  const actual=Buffer.from(signature),wanted=Buffer.from(sign(body));if(actual.length!==wanted.length||!timingSafeEqual(actual,wanted))return false;
  try{const data=JSON.parse(Buffer.from(body,'base64url').toString());return data.v===2&&data.revision===revision&&Number.isSafeInteger(data.exp)&&data.exp>Date.now()&&data.exp<=Date.now()+MAX_AGE*1000+60000;}catch{return false;}
 }
 function cookie(value,name=cookieName,clear=false) {return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${clear?'; Max-Age=0':''}${secureCookie?'; Secure':''}`;}
 function clearCookies(res){res.setHeader('Set-Cookie',[cookie('',cookieName,true),cookie('',entryName,true)]);}
 function permitted(req){
  if(!valid(req))return false;
  const dest=req.headers['x-axio-destination'],mode=req.headers['x-axio-mode'],accept=String(req.headers['x-axio-accept']||'');
  const navigation=['document','iframe','frame'].includes(dest)||mode==='navigate'||(!dest&&accept.includes('text/html'));
  if(!navigation)return true;
  const entry=entries.get(readCookie(req,entryName)),id=req.headers['x-axio-request-id'];
  if(!entry||entry.expires<Date.now()||!id||entry.session!==readCookie(req,cookieName))return false;
  const requested=new URL(safeNext(req.headers['x-axio-original-uri']),origin);
  if(entry.target!==requested.pathname+requested.search)return false;
  // Nginx can check the same document again during its index.html redirect.
  if(entry.requestId&&entry.requestId!==id)return false;
  entry.requestId=id;return true;
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  const nonce=randomBytes(18).toString('base64');res.setHeader('Content-Security-Policy',`default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`);
  const wantsJSON=(req.headers.accept||'').includes('application/json');
  function html(status,error='',next='/',unlocked=false){res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?'':page({next,nonce,error,unlocked}));}
  function failure(status,error,next='/',json=wantsJSON){if(json){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error}));}else html(status,error,next);}
  function redirect(target){res.writeHead(303,{Location:target});res.end();}
  try {
   const url=new URL(req.url,origin);
   if(url.pathname==='/health'&&req.method==='GET'){res.writeHead(204);res.end();return;}
   if(url.pathname==='/check'&&['GET','HEAD'].includes(req.method)){res.writeHead(permitted(req)?204:401);res.end();return;}
   if(url.pathname==='/access/visit.js'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end("addEventListener('pageshow',event=>{if(event.persisted)location.reload();});");return;}
   if(url.pathname==='/denied'){
    const next=safeNext(req.headers['x-axio-original-uri']);
    if(['GET','HEAD'].includes(req.headers['x-axio-original-method']||req.method)&&(req.headers.accept||'').includes('text/html')&&!next.startsWith('/api/'))redirect('/access?'+new URLSearchParams({next}));
    else failure(401,'Vui lòng mở khóa Axio để tiếp tục.','/',true);return;
   }
   if(url.pathname==='/access'&&['GET','HEAD'].includes(req.method)){if(!valid(req))clearCookies(res);html(200,'',safeNext(url.searchParams.get('next')));return;}
   if(['/access/unlock','/access/lock'].includes(url.pathname)&&req.method==='POST') {
    if(req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'){failure(403,'Yêu cầu không hợp lệ. Hãy tải lại trang Axio.');return;}
    if(!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded')){failure(415,'Dữ liệu không hợp lệ.');return;}
    if(Number(req.headers['content-length']||0)>4096){failure(413,'Dữ liệu quá dài.');return;}
    const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>4096){failure(413,'Dữ liệu quá dài.');return;}chunks.push(chunk);}
    const form=new URLSearchParams(Buffer.concat(chunks).toString()),next=safeNext(form.get('next'));
    if(url.pathname==='/access/lock'){entries.delete(readCookie(req,entryName));clearCookies(res);redirect('/access?'+new URLSearchParams({next}));return;}
    const now=Date.now(),ip=String(req.headers['x-real-ip']||req.socket.remoteAddress).slice(0,80);
    for(const [key,value]of attempts)if(now-value.start>=60000)attempts.delete(key);
    if(attempts.size>=10000&&!attempts.has(ip)){res.setHeader('Retry-After','60');failure(429,'Bạn thử quá nhiều lần. Vui lòng đợi một phút.',next);return;}
    const bucket=attempts.get(ip)||{start:now,count:0};attempts.set(ip,bucket);
    if(bucket.count>=8){res.setHeader('Retry-After',String(Math.max(1,Math.ceil((60000-(now-bucket.start))/1000))));failure(429,'Bạn thử quá nhiều lần. Vui lòng đợi một phút.',next);return;}
    bucket.count++;
    const password=form.get('password')||'';
    if(password.length>256){failure(401,'Mật khẩu chưa đúng. Bạn thử lại nhé.',next);return;}
    const key=await scrypt(password,salt,64);
    if(!timingSafeEqual(key,expected)){failure(401,'Mật khẩu chưa đúng. Bạn thử lại nhé.',next);return;}
    for(const [key,value]of entries)if(value.expires<now)entries.delete(key);
    if(entries.size>=10000){failure(503,'Chưa thể mở Axio. Bạn thử lại sau một phút.',next);return;}
    attempts.delete(ip);const session=issue(),entry=randomBytes(32).toString('hex'),target=new URL(next,origin);
    entries.set(entry,{session,target:target.pathname+target.search,expires:now+60000,requestId:null});
    res.setHeader('Set-Cookie',[cookie(session),cookie(entry,entryName)]);
    if(wantsJSON){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({redirect:next}));}else redirect(next);return;
   }
   res.writeHead(404);res.end();
  }catch{if(!res.headersSent)failure(500,'Chưa thể mở Axio. Bạn thử lại nhé.');else res.end();}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=60;
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href){
 const config=JSON.parse(readFileSync(process.env.AXIO_ACCESS_CONFIG||'/etc/axio-access/config.json','utf8'));
 const server=createGate(config);server.listen(config.port||3018,'127.0.0.1',()=>console.log('Axio private access ready on loopback'));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
