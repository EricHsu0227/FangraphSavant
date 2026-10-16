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
  if(url.pathname.startsWith('/api/')||!['GET','HEAD'].includes(request.method))return handler.fetch(trusted,env,ctx);
  const asset=await env.ASSETS.fetch(trusted.url,{method:trusted.method,headers:trusted.headers});
  if(asset.status!==404)return asset;
  return handler.fetch(trusted,env,ctx);
 }
};}
