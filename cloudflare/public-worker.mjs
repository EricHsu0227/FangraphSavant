import {identityRequest,safeReturnPath} from './access.mjs';

// The public deployment never trusts client-provided account identity.
export function publicWorker(handler){return {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  const trusted=identityRequest(request,null);
  if(url.pathname==='/api/preferences'||url.pathname==='/api/preferences/')return Response.json({signedIn:false,syncAvailable:false,error:'Preferences are saved in this browser. Account sync is not enabled on this public deployment.'},{status:401,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
  if(url.pathname==='/signin-with-chatgpt'||url.pathname==='/signout-with-chatgpt'){
   let path=safeReturnPath(url.searchParams.get('return_to'),url.origin);
   if(['/signin-with-chatgpt','/signout-with-chatgpt','/callback'].includes(new URL(path,url.origin).pathname))path='/?page=Settings';
   return Response.redirect(new URL(path,url.origin).href,302);
  }
  // Profiles and overall leaders use prebuilt verified records; optional live
  // metadata remains independent, so an upstream outage cannot blank the page.
  if(url.pathname==='/api/research'&&request.method==='GET'){
   const q=url.searchParams,view=q.get('view'),year=Number(q.get('year')??2026),id=Number(q.get('id')),kind=q.get('kind')==='pitching'?'pitching':'batting';
   const profile=view==='profile'&&Number.isInteger(id)&&id>0&&id<=99999999;
   const leaders=view==='leaders'&&(!q.get('hand')||q.get('hand')==='all')&&q.get('refreshStatcast')!=='1';
   if((profile||leaders)&&Number.isInteger(year)&&year>=2015&&year<=2026){
    const path=profile?`/data/profiles/${id}-${kind}.json`:`/data/leaders/${year}-${kind}.json`;
    const asset=await env.ASSETS.fetch(new URL(path,url.origin).href,{method:'GET'});
    if(asset.ok){
     if(leaders){const headers=new Headers(asset.headers);headers.set('Cache-Control','public, max-age=300');headers.set('Content-Type','application/json');headers.set('X-Content-Type-Options','nosniff');return new Response(asset.body,{headers});}
     const data=await asset.json();return Response.json({...data,year},{headers:{'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
    }
   }
  }
  if(url.pathname.startsWith('/api/')||!['GET','HEAD'].includes(request.method))return handler.fetch(trusted,env,ctx);
  const asset=await env.ASSETS.fetch(trusted.url,{method:trusted.method,headers:trusted.headers});
  if(asset.status!==404)return asset;
  return handler.fetch(trusted,env,ctx);
 }
};}
