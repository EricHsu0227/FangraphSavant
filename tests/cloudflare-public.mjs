import test from 'node:test';
import assert from 'node:assert/strict';
import {publicWorker} from '../cloudflare/public-worker.mjs';
function setup(){
 const calls=[];
 const env={ASSETS:{async fetch(url,init){calls.push({kind:'asset',url,headers:init.headers});return new Response('asset',{status:new URL(url).pathname==='/app.js'?200:404});}},DB:{prepare(){throw Error('Public requests must not touch account storage');}}};
 const worker=publicWorker({async fetch(request){calls.push({kind:'handler',url:request.url,headers:request.headers,body:request.method==='POST'?await request.text():null});return Response.json({ok:true});}});
 return {calls,env,run:(path,init)=>worker.fetch(new Request('https://desk.test'+path,init),env,{})};
}
test('Public pages, assets and baseball APIs work without Access configuration or cookies',async()=>{
 const {run,calls}=setup();
 for(const path of ['/','/?page=Leaderboards','/app.js','/api/baseball?resource=schedule','/api/research?resource=game'])assert.equal((await run(path)).status,200);
 assert.equal(calls.filter(x=>x.kind==='asset').length,3);
 assert.equal(calls.filter(x=>x.kind==='handler').length,4);
});
test('Anonymous and forged account reads/writes never access existing D1 preferences',async()=>{
 const {run,calls}=setup();
 for(const path of ['/api/preferences','/api/preferences/'])for(const method of ['GET','PUT']){
  const response=await run(path,{method,headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.com','fangraphsavant-auth-provider':'cloudflare-access','Cf-Access-Jwt-Assertion':'fake'},...(method==='PUT'?{body:'{}'}:{})});
  assert.equal(response.status,401);assert.equal((await response.json()).syncAvailable,false);
  assert.match(response.headers.get('Cache-Control'),/no-store/);
 }
 assert.equal(calls.length,0);
});
test('Public Worker removes all unverified identity headers from dynamic and asset requests',async()=>{
 const {run,calls}=setup();
 for(const path of ['/','/app.js','/api/research'])await run(path,{headers:{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'spoof@example.com','oai-authenticated-user-full-name':'spoof','fangraphsavant-auth-provider':'cloudflare-access','accept':'text/html'}});
 for(const call of calls){for(const key of call.headers.keys())assert.ok(!key.startsWith('oai-authenticated-')&&key!=='fangraphsavant-auth-provider');assert.equal(call.headers.get('accept'),'text/html');}
});
test('Dynamic POST requests retain their bodies and bypass asset fetch',async()=>{
 const {run,calls}=setup();await run('/api/research',{method:'POST',body:'{"season":2026}'});
 assert.equal(calls.length,1);assert.equal(calls[0].kind,'handler');assert.equal(calls[0].body,'{"season":2026}');
});
test('Legacy sign-in links return to the app without external redirects or auth loops',async()=>{
 const {run}=setup();
 assert.equal((await run('/signin-with-chatgpt?return_to='+encodeURIComponent('/?page=Settings'))).headers.get('Location'),'https://desk.test/?page=Settings');
 assert.equal((await run('/signin-with-chatgpt?return_to='+encodeURIComponent('//evil.test'))).headers.get('Location'),'https://desk.test/');
 assert.equal((await run('/signout-with-chatgpt?return_to=/signin-with-chatgpt')).headers.get('Location'),'https://desk.test/?page=Settings');
});
