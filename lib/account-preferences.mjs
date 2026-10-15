import {preferenceBackup,validatePreferenceBackup} from './preferences.mjs';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
const reply=(body,status=200)=>Response.json(body,{status,headers});
export async function readPreferences(db,userId){
 const profile=await db.prepare('SELECT revision, updated_at FROM preference_profiles WHERE user_id = ?').bind(userId).first();
 if(!profile)return {revision:0,preferences:{},updatedAt:null};
 const result=await db.prepare('SELECT value FROM preference_chunks WHERE user_id = ? ORDER BY part').bind(userId).all();
 const text=(result.results??[]).map(x=>x.value).join('');
 return {revision:profile.revision,preferences:text?JSON.parse(text):{},updatedAt:profile.updated_at};
}
export async function preferenceRequest(request,{user,db}){
 if(!user?.userId)return reply({error:'Sign in to save preferences to your account.',signedIn:false},401);
 if(!db)return reply({error:'Account storage is temporarily unavailable. Your local preferences are still saved.'},503);
 try{
  if(request.method==='GET')return reply({user:{displayName:user.displayName,email:user.email,provider:request.headers.get('fangraphsavant-auth-provider')==='cloudflare-access'?'cloudflare-access':'chatgpt'},...await readPreferences(db,user.userId)});
  if(request.method!=='PUT')return reply({error:'Method not allowed.'},405);
  if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return reply({error:'Use this site to update your preferences.'},403);
  if(!request.headers.get('Content-Type')?.includes('application/json'))return reply({error:'Send JSON preferences.'},415);
  if(Number(request.headers.get('Content-Length')??0)>4100000)return reply({error:'Preferences exceed the 4 MB limit.'},413);
  const text=await request.text();if(text.length>4000000)return reply({error:'Preferences exceed the 4 MB limit.'},413);
  const body=JSON.parse(text),changes=body.changes;
  if(!Number.isInteger(body.revision)||body.revision<0||!changes||typeof changes!=='object'||Array.isArray(changes))return reply({error:'Invalid preference update.'},400);
  const check=Object.fromEntries(Object.entries(changes).map(([k,v])=>[k,v===null?'':v]));
  validatePreferenceBackup({app:'FangraphSavant',version:1,preferences:check});
  const current=await readPreferences(db,user.userId);
  if(current.revision!==body.revision)return reply({error:'Preferences changed on another device. Reload and retry.',revision:current.revision},409);
  const merged={...current.preferences};for(const [k,v]of Object.entries(changes)){if(v===null)delete merged[k];else merged[k]=v;}
  const next=validatePreferenceBackup(preferenceBackup(merged)),serialized=JSON.stringify(next),updatedAt=new Date().toISOString(),token=crypto.randomUUID();
  const statements=[
   db.prepare('INSERT INTO preference_profiles (user_id, revision, write_token, updated_at) VALUES (?, 0, ?, ?) ON CONFLICT (user_id) DO NOTHING').bind(user.userId,'',updatedAt),
   db.prepare('UPDATE preference_profiles SET revision = revision + 1, write_token = ?, updated_at = ? WHERE user_id = ? AND revision = ?').bind(token,updatedAt,user.userId,body.revision),
   db.prepare('DELETE FROM preference_chunks WHERE user_id = ? AND EXISTS (SELECT 1 FROM preference_profiles WHERE user_id = ? AND write_token = ?)').bind(user.userId,user.userId,token)
  ];
  for(let part=0,start=0;start<serialized.length;part++,start+=60000)statements.push(db.prepare('INSERT INTO preference_chunks (user_id, part, value) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM preference_profiles WHERE user_id = ? AND write_token = ?)').bind(user.userId,part,serialized.slice(start,start+60000),user.userId,token));
  const results=await db.batch(statements);
  if(!results[1]?.meta?.changes)return reply({error:'Preferences changed on another device. Reload and retry.'},409);
  return reply({revision:body.revision+1,updatedAt});
 }catch(error){const invalid=error instanceof SyntaxError||/preferences|unsupported|JSON/.test(error.message);return reply({error:invalid?'Invalid or oversized preferences.':'Account storage is temporarily unavailable. Local preferences are kept.'},invalid?400:503);}
}
