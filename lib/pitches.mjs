/** MLB Gameday5.60 theme. Markers encode outcome; trail colors encode pitch type. */
export const MLB_PITCH_COLORS={ball:'#098314',strike:'#c61b2b',inPlay:'#0062e3',out:'#7756b3',unknown:'#697c94'};
export function pitchOutcome(p){const code=p.callCode??'';if(p.isInPlay||['X','Y','D','E'].includes(code)||/in play/i.test(p.description??''))return p.isOut||['X','Y'].includes(code)?'out':'inPlay';if(p.isBall||/ball|hit by pitch/i.test(p.call??p.description??''))return 'ball';if(p.isStrike||/strike|foul/i.test(p.call??p.description??''))return 'strike';return 'unknown';}
export function safePitchColor(value){return typeof value==='string'&&(/^(#[0-9a-f]{6}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+|1\.0))?\s*\))$/i.test(value))?value:null;}
export function pitchColor(p,by='result'){return by==='type'?safePitchColor(p.trailColor)??'#697c94':MLB_PITCH_COLORS[pitchOutcome(p)];}
export function pitchZone(pitches){const ref=pitches.find(p=>Number.isFinite(p.top)&&Number.isFinite(p.bottom)&&p.top>p.bottom),top=ref?.top??3.5,bottom=ref?.bottom??1.5,width=Number(ref?.zoneWidth)>0?Number(ref.zoneWidth)/12:17/12;return {top,bottom,width,reported:!!ref};}
export function projectPitch(x,z){return {x:120+x*55,y:253-z*49};}
