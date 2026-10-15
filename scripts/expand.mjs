import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {brotliDecompressSync} from 'node:zlib';
const parts=[];
for(let i=0;i<5;i++)parts.push(await readFile('source/chunk'+String(i).padStart(2,'0')+'.txt','utf8'));
const data=JSON.parse(brotliDecompressSync(Buffer.from(parts.join(''),'base64')).toString('utf8'));
for(const [path,content] of Object.entries(data)){
 if(path.startsWith('/')||path.split('/').includes('..'))throw new Error('Invalid source path '+path);
 await mkdir(dirname(path),{recursive:true});
 await writeFile(path,content,'utf8');
}
await rm('source',{recursive:true,force:true});
await rm('scripts/expand.mjs',{force:true});
await rm('.github/workflows/expand.yml',{force:true});
console.log('Restored '+Object.keys(data).length+' FangraphSavant project files.');
