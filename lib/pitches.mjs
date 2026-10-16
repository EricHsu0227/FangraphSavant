/** MLB Gameday5.60 theme. Markers encode outcome; trail colors encode pitch type. */
export const MLB_PITCH_COLORS={ball:'#098314',strike:'#c61b2b',inPlay:'#0062e3',out:'#7756b3',unknown:'#697c94'};
export function pitchOutcome(p){const code=p.callCode??'',description=String(p.call??p.description??'');if(p.isInPlay||['X','Y','D','E'].includes(code)||/in play/i.test(description))return p.isOut||['X','Y'].includes(code)?'out':'inPlay';if(p.isStrike||/strike|foul/i.test(description))return 'strike';if(p.isBall||/ball|hit by pitch/i.test(description))return 'ball';return 'unknown';}
export function safePitchColor(value){return typeof value==='string'&&(/^(#[0-9a-f]{6}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+|1\.0))?\s*\))$/i.test(value))?value:null;}
export function pitchColor(p,by='result'){return by==='type'?safePitchColor(p.trailColor)??'#697c94':MLB_PITCH_COLORS[pitchOutcome(p)];}
export function pitchZone(pitches){const ref=pitches.find(p=>Number.isFinite(p.top)&&Number.isFinite(p.bottom)&&p.top>p.bottom),top=ref?.top??3.5,bottom=ref?.bottom??1.5,width=Number(ref?.zoneWidth)>0?Number(ref.zoneWidth)/12:17/12;return {top,bottom,width,reported:!!ref};}
export function projectPitch(x,z){return {x:120+x*55,y:253-z*49};}
// Expand the plotting window instead of clipping a measured pitch off the edge.
export function pitchViewport(pitches){const points=pitches.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)).map(p=>projectPitch(p.x,p.z));const left=Math.min(0,...points.map(p=>p.x-18)),right=Math.max(240,...points.map(p=>p.x+18)),top=Math.min(0,...points.map(p=>p.y-18)),bottom=Math.max(280,...points.map(p=>p.y+18));return {left,top,width:right-left,height:bottom-top};}
