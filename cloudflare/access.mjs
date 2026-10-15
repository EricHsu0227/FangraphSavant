const certificates=new Map();
export function safeReturnPath(value,origin){try{if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//'))return '/';const url=new URL(value,origin);return url.origin===origin?url.pathname+url.search+url.hash:'/';}catch{return '/';}}
export function accessConfig(env){
 const team=String(env.ACCESS_TEAM_DOMAIN??'').replace(/^https:\/\//,'').replace(/\/$/,'');
 if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)||!env.ACCESS_AUDIENCE||!env.OWNER_EMAIL)return null;
 return {team,audience:env.ACCESS_AUDIENCE,ownerEmail:String(env.OWNER_EMAIL).toLowerCase()};
}
const decode=value=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));
export async function verifyAccess(token,config,fetcher=fetch){
 if(!config||typeof token!=='string'||token.length>16000)return null;
 try{
  const parts=token.split('.');if(parts.length!==3)return null;
  const header=decode(parts[0]),claims=decode(parts[1]),now=Date.now()/1000;
  if(header.alg!=='RS256'||!header.kid||claims.iss!==`https://${config.team}`||!Array.isArray(claims.aud)||!claims.aud.includes(config.audience)||!Number.isFinite(claims.exp)||claims.exp<=now||(claims.nbf&&claims.nbf>now+30)||!claims.sub||String(claims.email??'').toLowerCase()!==config.ownerEmail)return null;
  let cached=certificates.get(config.team);
  if(!cached||cached.until<Date.now()||!cached.keys.some(k=>k.kid===header.kid)){
   const response=await fetcher(`https://${config.team}/cdn-cgi/access/certs`,{signal:AbortSignal.timeout(10000)});
   if(!response.ok)return null;const payload=await response.json();cached={keys:payload.keys??[],until:Date.now()+300000};certificates.set(config.team,cached);
  }
  const jwk=cached.keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)return null;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const signature=Uint8Array.from(atob(parts[2].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature,new TextEncoder().encode(parts[0]+'.'+parts[1])))return null;
  return {userId:'cloudflare:'+claims.sub,email:claims.email,fullName:claims.name??null};
 }catch{return null;}
}
export function identityRequest(request,user){
 const headers=new Headers(request.headers);
 for(const key of [...headers.keys()])if(key.startsWith('oai-authenticated-')||key==='fangraphsavant-auth-provider')headers.delete(key);
 headers.set('oai-authenticated-user-id',user.userId);headers.set('oai-authenticated-user-email',user.email);headers.set('fangraphsavant-auth-provider','cloudflare-access');
 if(user.fullName){headers.set('oai-authenticated-user-full-name',encodeURIComponent(user.fullName));headers.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');}
 return new Request(request,{headers});
}
