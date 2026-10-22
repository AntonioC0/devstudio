import {readFile,writeFile} from 'node:fs/promises';
const definitions=[['security','3.1'],['development','2.2'],['testing','2.1']];
const skills=await Promise.all(definitions.map(async([id,version])=>({id,version,content:await readFile(new URL(`../docs/skills/${id}.md`,import.meta.url),'utf8')})));
const source='export const SKILLS='+JSON.stringify(skills)+';\n',target=new URL('../skills.js',import.meta.url);
if(process.argv.includes('--check')){
  if(await readFile(target,'utf8')!==source)throw new Error('Skills desatualizadas. Execute npm run skills:sync.');
}else await writeFile(target,source);
