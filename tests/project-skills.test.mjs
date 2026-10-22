import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {exportProjectFiles} from '../client/export-project.js';
import {SKILLS} from '../skills.js';

test('export carries code and all fixed skills through a real ZIP round trip',()=>{
  const files=[{path:'index.html',content:'<h1>Meu aplicativo</h1>'},{path:'script.js',content:'document.title="Meu aplicativo";'}];
  const exported=exportProjectFiles(files);
  const zipped=zipSync(Object.fromEntries(Object.entries(exported).map(([path,content])=>[path,strToU8(content)])));
  const unpacked=unzipSync(zipped);
  for(const file of files)assert.equal(strFromU8(unpacked[file.path]),file.content);
  for(const skill of SKILLS){
    const path=`dev-studio-skills/${skill.id}.md`;
    assert.equal(strFromU8(unpacked[path]),skill.content);
    assert.ok(strFromU8(unpacked['AGENTS.md']).includes(path));
  }
  const requirements=strFromU8(unpacked['dev-studio-skills/requirements.md']);
  assert.match(requirements,/software que o usuário está criando/);
  assert.match(requirements,/não são herdados/);
  assert.match(requirements,/não provisiona backend/);
});

test('export preserves existing project guidance and avoids documentation directory collisions',()=>{
  const files=[{path:'AGENTS.md',content:'# Minha orientação\nUse o estilo do projeto.'},{path:'dev-studio-skills/custom.md',content:'Documento original'},{path:'dev-studio-skills-2/other.md',content:'Outro documento'}];
  const entries=exportProjectFiles(files);
  assert.ok(entries['AGENTS.md'].includes(files[0].content));
  assert.equal(entries['dev-studio-skills/custom.md'],'Documento original');
  assert.equal(entries['dev-studio-skills-2/other.md'],'Outro documento');
  assert.match(entries['AGENTS.md'],/dev-studio-skills-3\/security.md/);
  assert.equal(entries['dev-studio-skills-3/security.md'],SKILLS[0].content);
  assert.deepEqual(files[0],{path:'AGENTS.md',content:'# Minha orientação\nUse o estilo do projeto.'});
});

test('export fails before producing an archive for unsafe paths or detectable secrets',()=>{
  for(const file of [{path:'../outside.js',content:'x'},{path:'.env',content:'x'},{path:'legacy.js',content:'const value="sk-proj-'+('Q'.repeat(40))+'";'}])assert.throws(()=>exportProjectFiles([file]),e=>e.status===422);
  const entries=exportProjectFiles([{path:'__proto__',content:'Conteúdo do usuário'}]);
  assert.equal(Object.getPrototypeOf(entries),null);
  assert.equal(entries.__proto__,'Conteúdo do usuário');
});
