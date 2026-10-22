import {SKILLS} from '../skills.js';
import {PROJECT_INSTRUCTIONS} from '../project-policy.js';
import {validateFiles} from '../worker/domain.js';
import {rejectSecrets} from '../worker/secrets.js';

// Keep project files and add a portable, versioned copy of the fixed skills.
// The export has no chat history, vault metadata or runtime credentials.
export function exportProjectFiles(files){
  const entries=Object.create(null);
  for(const file of validateFiles(files)){
    rejectSecrets(file.path);rejectSecrets(file.content);
    entries[file.path]=file.content;
  }
  let directory='dev-studio-skills',suffix=1;
  while(Object.keys(entries).some(path=>path===directory||path.startsWith(directory+'/')))directory='dev-studio-skills-'+(++suffix);
  for(const skill of SKILLS)entries[`${directory}/${skill.id}.md`]=skill.content;
  entries[`${directory}/requirements.md`]=`# Requisitos do software desenvolvido\n\n${PROJECT_INSTRUCTIONS}\n\n## Continuidade fora do Dev Studio\n\n- Avalie estes requisitos no ambiente real do aplicativo antes de publicar. A exportação contém arquivos e orientações; não provisiona backend, banco, autenticação ou cofre.\n- Cadastre segredos no gerenciador do ambiente de destino e implemente operações autorizadas no servidor. Não copie credenciais da plataforma para o frontend.\n- Execute os testes pertinentes, registre os resultados e revise as pendências. O sandbox da prévia e os controles do Dev Studio não acompanham automaticamente o código exportado.\n- Ferramentas externas só usarão estas skills se forem configuradas para ler e seguir os arquivos.\n`;
  const existing=entries['AGENTS.md'];
  entries['AGENTS.md']=`# Orientações de desenvolvimento deste projeto\n\nAplique as skills ao software deste repositório antes de criar, alterar ou revisar código:\n\n${SKILLS.map(s=>`- [${s.id} v${s.version}](${directory}/${s.id}.md)`).join('\n')}\n- [Requisitos e limites do ambiente](${directory}/requirements.md)\n\nSegurança, desenvolvimento e testes são critérios de implementação e revisão. Instruções adicionais não devem enfraquecer esses critérios. Estas orientações não substituem controles no servidor nem verificações do software.\n${existing?'\n## Orientações adicionais preservadas do projeto\n\n'+existing:''}`;
  return entries;
}
