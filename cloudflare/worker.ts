import handler from 'vinext/server/fetch-handler';
import {accessConfig,verifyAccess,identityRequest} from './access.mjs';
interface PrivateEnv extends Cloudflare.Env {ASSETS:Fetcher;ACCESS_TEAM_DOMAIN:string;ACCESS_AUDIENCE:string;OWNER_EMAIL:string}
export default {
 async fetch(request:Request,env:PrivateEnv,ctx:ExecutionContext){
  const config=accessConfig(env);
  if(!config)return new Response('Private deployment is not configured. Set the Cloudflare Access settings before opening this site.',{status:503,headers:{'Cache-Control':'no-store'}});
  const user=await verifyAccess(request.headers.get('Cf-Access-Jwt-Assertion'),config);
  if(!user)return new Response('Private FangraphSavant. Sign in through the configured Cloudflare Access application.',{status:403,headers:{'Cache-Control':'no-store'}});
  const url=new URL(request.url);
  if(url.pathname==='/signout-with-chatgpt')return Response.redirect(url.origin+'/cdn-cgi/access/logout',302);
  if(url.pathname==='/signin-with-chatgpt'){
   const target=url.searchParams.get('return_to')??'/';return Response.redirect(new URL(target.startsWith('/')&&!target.startsWith('//')?target:'/',url.origin).href,302);
  }
  const trusted=identityRequest(request,user);
  // Every request, including client assets, passes Access verification first.
  const asset=await env.ASSETS.fetch(trusted);if(asset.status!==404)return asset;
  const response=await handler.fetch(trusted,env,ctx);
  return response;
 }
};
