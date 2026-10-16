export const DEFAULT_APPEARANCE={background:'theme',color:'#101b2d',accent:'#253a56',image:'',tintPanels:true,dim:65,pattern:16,zoneSize:160};
export function normalizeAppearance(value={}){const v=value&&typeof value==='object'?value:{},hex=x=>typeof x==='string'&&/^#[a-f0-9]{6}$/i.test(x),bounded=(x,lo,hi,fallback)=>Number.isFinite(Number(x))?Math.max(lo,Math.min(hi,Number(x))):fallback;return {tintPanels:v.tintPanels!==false,background:['theme','solid','gradient','grid','image'].includes(v.background)?v.background:'theme',color:hex(v.color)?v.color:DEFAULT_APPEARANCE.color,accent:hex(v.accent)?v.accent:DEFAULT_APPEARANCE.accent,image:typeof v.image==='string'&&v.image.length<=2800000&&/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v.image)?v.image:'',dim:bounded(v.dim,35,90,65),pattern:bounded(v.pattern,8,60,16),zoneSize:bounded(v.zoneSize,130,230,160)};}
export const BACKGROUND_PALETTES=[
 {name:'Graphite',color:'#18191c',accent:'#46505b'},
 {name:'Forest',color:'#10281e',accent:'#245c3e'},
 {name:'Burgundy',color:'#32151d',accent:'#773045'},
 {name:'Plum',color:'#291b35',accent:'#633e79'},
 {name:'Coffee',color:'#2a211a',accent:'#715039'},
 {name:'Olive',color:'#252a17',accent:'#5b6830'},
 {name:'Teal',color:'#102c2d',accent:'#27696a'},
 {name:'Charcoal',color:'#111111',accent:'#444444'}
];
function mix(hex,other,amount){const a=hex.slice(1).match(/../g).map(x=>parseInt(x,16)),b=other.slice(1).match(/../g).map(x=>parseInt(x,16));return '#'+a.map((x,i)=>Math.round(x*(1-amount)+b[i]*amount).toString(16).padStart(2,'0')).join('');}
export function backgroundStyle(value){
 const v=normalizeAppearance(value),shade=`rgba(0,0,0,${v.dim/100})`;if(v.background==='theme')return {};
 // Tint the entire workspace, including its surfaces, rather than leaving blue panels.
 const rgb=v.color.slice(1).match(/../g).map(x=>parseInt(x,16)),bright=Math.max(...rgb),base=bright>85?mix(v.color,'#000000',1-85/bright):v.color;
 const style={backgroundColor:base,...(v.tintPanels?{'--bg':base,'--panel':mix(base,'#ffffff',.035),'--head':mix(base,'#ffffff',.075),'--stripe':mix(base,'#ffffff',.02),'--subtle':mix(base,'#ffffff',.055),'--nav':mix(base,'#000000',.12),'--line':mix(base,'#ffffff',.17)}:{})};
 if(v.background==='solid')return {...style,backgroundImage:'none'};
 if(v.background==='gradient')return {...style,backgroundImage:`radial-gradient(ellipse at top left,${mix(v.accent,'#000000',.5)},transparent 75%)`};
 if(v.background==='grid')return {...style,backgroundImage:`linear-gradient(${shade},${shade}),linear-gradient(${v.accent} 1px,transparent 1px),linear-gradient(90deg,${v.accent} 1px,transparent 1px)`,backgroundSize:`auto,${v.pattern}px ${v.pattern}px,${v.pattern}px ${v.pattern}px`};
 return {...style,backgroundImage:v.image?`linear-gradient(${shade},${shade}),url("${v.image}")`:'none',backgroundPosition:'center',backgroundSize:'cover'};
}
const allowed=/^fs:(?:columns|hero|views|percentiles|savant-percentiles|panel|interface|page-layout|game-layout|zone-display|war-model|appearance|theme|density|timezone|favorite)(?::|$)/;
export function preferenceBackup(storage){return {app:'FangraphSavant',version:1,preferences:Object.fromEntries(Object.entries(storage).filter(([key,value])=>allowed.test(key)&&typeof value==='string'))};}
export function validatePreferenceBackup(input){if(input?.app!=='FangraphSavant'||input.version!==1||!input.preferences||typeof input.preferences!=='object'||Array.isArray(input.preferences))throw Error('Choose a FangraphSavant preferences backup.');const entries=Object.entries(input.preferences);if(entries.length>1500||JSON.stringify(input).length>4000000)throw Error('This preferences file is too large.');for(const [key,value]of entries)if(!allowed.test(key)||typeof value!=='string'||key.length>300||value.length>3000000)throw Error('The file contains unsupported preferences.');const out=Object.fromEntries(entries);if(out['fs:appearance'])out['fs:appearance']=JSON.stringify(normalizeAppearance(JSON.parse(out['fs:appearance'])));return out;}
