'use client';
import {useEffect,useRef,useState} from 'react';
import {preferenceBackup} from '../lib/preferences.mjs';
export const RESTORED='fs:preferences-restored';
export function setPreference(key:string,value:string){if(localStorage.getItem(key)===value)return;localStorage.setItem(key,value);window.dispatchEvent(new CustomEvent('fs:preference-change',{detail:{key,value}}));}
export function removePreference(key:string){if(localStorage.getItem(key)===null)return;localStorage.removeItem(key);window.dispatchEvent(new CustomEvent('fs:preference-change',{detail:{key,value:null}}));}
type State={status:string,user?:{displayName:string,email:string,provider?:string},updatedAt?:string,error?:string};
export function useAccountPreferences(){
 const [state,setState]=useState<State>({status:'loading'}),retry=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let alive=true,ready=false,busy=false,revision=0,owner:string|null=null,updatedAt:string|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  const pending=new Map<string,string|null>();let user:State['user'];let savedQueue:any=null;try{savedQueue=JSON.parse(localStorage.getItem('fs:sync-pending')??'null')}catch{};
  const status=(value:string,error?:string)=>{if(alive)setState({status:value,user,updatedAt,error});};
  const persist=()=>{try{localStorage.setItem('fs:sync-pending',JSON.stringify({owner:owner??savedQueue?.owner??null,changes:Object.fromEntries(pending)}));}catch{}};
  const queue=()=>{clearTimeout(timer);timer=setTimeout(()=>void flush(),700);};
  const restore=(values:Record<string,string>,replace:boolean)=>{
   const current=preferenceBackup({...localStorage}).preferences;
   for(const key of replace?Object.keys(current):[])if(!(key in values)&&!pending.has(key))localStorage.removeItem(key);
   for(const [key,value]of Object.entries(values))if(!pending.has(key))localStorage.setItem(key,value);
   window.dispatchEvent(new Event(RESTORED));
  };
  const pull=async()=>{
   if(busy||!alive)return;busy=true;
   try{
    const response=await fetch('/api/preferences',{cache:'no-store',credentials:'same-origin'}),data:any=await response.json();
    if(response.status===401){ready=false;status('signed-out');return;}
    if(!response.ok)throw Error(data.error??'Could not load account preferences.');
    user=data.user;owner=user!.email;revision=data.revision;updatedAt=data.updatedAt;
    if(!ready){
     try{const saved=savedQueue;if(saved?.owner===owner)for(const [key,value]of Object.entries(saved.changes??{}))if(!pending.has(key))pending.set(key,value as string|null);}catch{}
     if(revision===0)for(const [key,value]of Object.entries(preferenceBackup({...localStorage}).preferences))if(!pending.has(key))pending.set(key,value as string);
    }
    restore(data.preferences,revision>0);ready=true;persist();status(pending.size?'saving':'saved');
   }catch(error:any){status('offline',error.message);}finally{busy=false;if(ready&&pending.size)queue();}
  };
  const flush=async()=>{
   if(!ready||busy||!pending.size||!alive)return;busy=true;const changes=Object.fromEntries(pending);status('saving');let conflict=false;
   try{
    const response=await fetch('/api/preferences',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,changes})}),data:any=await response.json();
    if(response.status===409){conflict=true;return;}
    if(response.status===401){ready=false;status('signed-out');return;}
    if(!response.ok)throw Error(data.error??'Could not save account preferences.');
    revision=data.revision;updatedAt=data.updatedAt;
    for(const [key,value]of Object.entries(changes))if(pending.get(key)===value)pending.delete(key);
    persist();status(pending.size?'saving':'saved');
   }catch(error:any){persist();status('offline',error.message);}finally{busy=false;if(conflict)void pull();else if(pending.size&&navigator.onLine){clearTimeout(timer);timer=setTimeout(()=>void flush(),5000);}}
  };
  const changed=(event:Event)=>{const {key,value}=(event as CustomEvent).detail;pending.set(key,value);persist();status(ready?'saving':user?'offline':'local');if(ready)queue();};
  const refresh=()=>{if(document.visibilityState==='visible'){if(pending.size&&ready)void flush();else void pull();}};
  retry.current=()=>{if(ready&&pending.size)void flush();else void pull();};
  window.addEventListener('fs:preference-change',changed);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
  const interval=setInterval(refresh,60000);void pull();
  return()=>{alive=false;clearTimeout(timer);clearInterval(interval);window.removeEventListener('fs:preference-change',changed);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[]);
 return {...state,retry:()=>retry.current()};
}
export type AccountState=ReturnType<typeof useAccountPreferences>;
export function AccountPanel({account}:{account:AccountState}){const path=typeof location==='undefined'?'/':location.pathname+location.search;return <section className="account-panel"><div><span className="eyebrow">ACCOUNT & SAVED PREFERENCES</span><h2>{account.user?.displayName??'Keep your research desk with you'}</h2><p>{account.user?'Columns, L/R pairs, percentiles, themes, backgrounds and saved boards sync to this account.':'Sign in to restore your preferences across devices. Local changes stay available while offline.'}</p></div><div className={'account-status '+account.status}><i/>{({loading:'Checking account…',saved:'Saved to account',saving:'Saving changes…',offline:'Saved locally · sync pending','signed-out':'Sign in to sync',local:'Saved locally'} as Record<string,string>)[account.status]??account.status}</div>{account.error&&<p role="status" className="note">{account.error}</p>}<div className="inline-controls">{account.user?<><button onClick={account.retry}>Sync now</button><a href={'/signout-with-chatgpt?return_to='+encodeURIComponent(path)} target="_top">Sign out</a></>:<a className="account-signin" href={'/signin-with-chatgpt?return_to='+encodeURIComponent(path)} target="_top">Sign in to your account</a>}{account.updatedAt&&<span className="subtle">Last saved {new Date(account.updatedAt).toLocaleString()}</span>}</div></section>}
