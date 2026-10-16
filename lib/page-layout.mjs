export function normalizePageLayout(value={}){
 const v=value&&typeof value==='object'?value:{},clean=a=>Array.isArray(a)?[...new Set(a.filter(x=>typeof x==='string'&&x.length<=180))].slice(0,120):[];
 return {width:['comfortable','wide','full'].includes(v.width)?v.width:'full',columns:v.columns===2?2:1,gap:['tight','normal','airy'].includes(v.gap)?v.gap:'normal',order:clean(v.order),hidden:clean(v.hidden),wide:clean(v.wide)};
}
export function arrangeBlocks(keys,config){const v=normalizePageLayout(config),present=new Set(keys);return [...v.order.filter(k=>present.has(k)),...keys.filter(k=>!v.order.includes(k))];}
export function moveBlock(keys,key,direction){const out=[...keys],i=out.indexOf(key),next=i+direction;if(i>=0&&next>=0&&next<out.length)[out[i],out[next]]=[out[next],out[i]];return out;}
export function playMatches(play,{query='',inning='all',side='all'}={}){
 const text=[play.batter?.fullName,play.pitcher?.fullName,play.description,play.event,play.inning].join(' ').toLowerCase();
 return (!query||text.includes(query.trim().toLowerCase()))&&(inning==='all'||play.inning===Number(inning))&&(side==='all'||play.top===(side==='away'));
}
export function playWindow(plays,page=0,size=12){const pages=Math.max(1,Math.ceil(plays.length/size)),current=Math.min(Math.max(0,Math.floor(Number(page)||0)),pages-1);return {page:current,pages,rows:plays.slice(current*size,(current+1)*size)};}
