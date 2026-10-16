'use client';
import {useEffect,useRef,useState} from 'react';
import {Settings2,ArrowUp,ArrowDown,X} from 'lucide-react';
import {useSavedConfig} from './customize';
import {normalizePageLayout,arrangeBlocks,moveBlock} from '../lib/page-layout.mjs';
type Block={key:string,title:string,structural:boolean};
export function LayoutWorkspace({page,children}:{page:string,children:React.ReactNode}){
 const [saved,save]=useSavedConfig('fs:page-layout:'+page,normalizePageLayout()),config=normalizePageLayout(saved),[editing,setEditing]=useState(false),[blocks,setBlocks]=useState<Block[]>([]),surface=useRef<HTMLDivElement>(null);
 const signature=JSON.stringify(config);
 useEffect(()=>{
  const root=surface.current;if(!root)return;let frame=0;
  const scan=()=>{
   const count=new Map<string,number>(),elements=Array.from(root.children).filter(el=>el instanceof HTMLElement) as HTMLElement[];
   const next=elements.map((el,index)=>{
    const title=el.dataset.layoutTitle??el.querySelector('h1,h2,h3')?.textContent??(el.classList.contains('tabs')?'Section tabs':el.classList.contains('hero-stats')?'At a glance':el.classList.contains('profile-header')?'Player header':el.classList.contains('game-heading')?'Game scoreboard':el.classList.contains('game-tabs')?'Game navigation':el.classList.contains('game-quick-nav')?'Find a play':el.classList.contains('schedule-layout')?'Calendar & schedule':el.classList.contains('overview-grid')?'Overview comparisons':el.classList.contains('back')?'Back navigation':el.getAttribute('aria-label')??el.className.split(' ')[0]??'Section');
    const base=String(title).replace(/\d+/g,'#').slice(0,140),n=count.get(base)??0;count.set(base,n+1);
    const key=base+':'+n;el.dataset.layoutBlock=key;
    return {key,title:String(title).slice(0,90),structural:el.matches('.section-navigation,.team-switcher,.tabs,.page-title,.profile-header,.game-heading,.game-tabs,.game-quick-nav,.back,.game-display-controls')};
   });
   const order=arrangeBlocks(next.map(b=>b.key),config);
   next.forEach((block,index)=>{const el=elements[index];el.style.order=String(order.indexOf(block.key));el.style.display=config.hidden.includes(block.key)?'none':'';el.style.gridColumn=config.columns===1||block.structural||config.wide.includes(block.key)?'1 / -1':'auto';});
   setBlocks(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
  };
  const observer=new MutationObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(scan)});scan();observer.observe(root,{childList:true,subtree:true});return()=>{observer.disconnect();cancelAnimationFrame(frame)};
 },[page,signature]);
 const set=(patch:object)=>save(normalizePageLayout({...config,...patch})),toggle=(field:'hidden'|'wide',key:string)=>set({[field]:config[field].includes(key)?config[field].filter((k:string)=>k!==key):[...config[field],key]});
 const ordered=arrangeBlocks(blocks.map(b=>b.key),config);
 return <div className="layout-workspace" data-width={config.width} data-columns={config.columns} data-gap={config.gap}>
  <div className="page-layout-toolbar"><span>{page} <small>· your layout</small></span><button aria-expanded={editing} onClick={()=>setEditing(!editing)}><Settings2 size={13}/>{editing?'Close layout':'Customize layout'}</button></div>
  {editing&&<section className="layout-editor" aria-label={'Customize '+page+' layout'}><header><div><b>{page} layout</b><p>Move, resize or hide sections. Each page saves its own layout on this device.</p></div><button aria-label="Close layout editor" onClick={()=>setEditing(false)}><X size={14}/></button></header><div className="filters"><label className="select-label"><span>Page width</span><select value={config.width} onChange={e=>set({width:e.target.value})}><option value="comfortable">Focused · 1100px</option><option value="wide">Wide · 1450px</option><option value="full">Full screen</option></select></label><label className="select-label"><span>Columns on desktop</span><select value={config.columns} onChange={e=>set({columns:Number(e.target.value)})}><option value={1}>One column</option><option value={2}>Two columns</option></select></label><label className="select-label"><span>Section spacing</span><select value={config.gap} onChange={e=>set({gap:e.target.value})}><option value="tight">Tight</option><option value="normal">Normal</option><option value="airy">Airy</option></select></label><button onClick={()=>save(normalizePageLayout())}>Reset this page</button><button onClick={()=>set({hidden:[]})}>Show all sections</button></div><div className="layout-blocks">{ordered.map((key:string,i:number)=>{const block=blocks.find(b=>b.key===key)!;return <div key={key}><label><input type="checkbox" checked={!config.hidden.includes(key)} onChange={()=>toggle('hidden',key)}/><span>{block.title}</span></label>{config.columns===2&&!block.structural&&<button aria-pressed={config.wide.includes(key)} onClick={()=>toggle('wide',key)}>{config.wide.includes(key)?'Full width':'Half width'}</button>}<button disabled={i===0} aria-label={'Move '+block.title+' up'} onClick={()=>set({order:moveBlock(ordered,key,-1)})}><ArrowUp size={12}/></button><button disabled={i===ordered.length-1} aria-label={'Move '+block.title+' down'} onClick={()=>set({order:moveBlock(ordered,key,1)})}><ArrowDown size={12}/></button></div>})}</div></section>}
  <div ref={surface} className="page-layout-surface">{children}</div>
 </div>;
}
