# Dev Studio — teste no Render

Workspace com React, servidor Node.js 24 e SQLite em memória, com execução integrada dos backends de teste dos projetos, preparado para hospedagem própria no plano gratuito do Render. Inclui contas com e-mail/senha, projetos, chat com anexos, prévia responsiva, exportação de código, cofre de APIs e skills fixas de segurança, desenvolvimento e testes.

## Atualizar sua instalação

Este pacote atualiza o próprio Dev Studio. Extraia o ZIP e envie o conteúdo para a raiz do repositório existente, preservando as pastas. Confirme as alterações na branch main; o Render usa o mesmo Blueprint e as mesmas variáveis privadas. Nenhum token adicional de GitHub/Render é necessário para executar os projetos dentro do Dev Studio.

Após o deploy, recarregue o aplicativo e crie uma sessão de teste. As sessões da versão anterior não são migradas; a instalação permanece temporária.

## O que enviar ao GitHub

Envie **o projeto completo deste pacote**, com `package.json`, `package-lock.json`, `render.yaml`, `server/`, `client/` e as demais pastas na raiz do repositório. Não envie apenas o HTML e não envie o ZIP como um único arquivo dentro do repositório. Prefira um repositório privado.

Não envie `.env`, chaves reais, bancos, `node_modules/`, `.build/` ou `dist/`. O `.gitignore` já exclui esses itens. O `.env.example` contém somente campos vazios e exemplos públicos.

## Hospedar no Render

1. Conecte o repositório ao Render e crie um **Blueprint**, usando o `render.yaml` da raiz.
2. O Blueprint cria apenas um serviço web no plano **Free**, sem banco externo ou disco pago. Build: `npm ci --include=dev && npm run build`. Inicialização: `npm start`. Health check: `/healthz`. O `--include=dev` instala também o esbuild necessário ao build, mesmo com `NODE_ENV=production`.
3. Quando solicitado, configure `OPENAI_API_KEY` no painel privado do Render. A chave fica no servidor. A API de IA tem cobrança própria, separada da hospedagem.
4. O Render gera `ACCESS_PASSWORD`. Consulte esse valor no painel **Environment**. Ao abrir o endereço do aplicativo, o navegador pede usuário **devstudio** e essa senha. Depois, crie uma conta temporária dentro do aplicativo.
5. O endereço público é obtido automaticamente de `RENDER_EXTERNAL_URL`. Se usar domínio próprio, configure `PUBLIC_ORIGIN` com sua origem HTTPS, sem caminhos, por exemplo `https://studio.exemplo.com`.

`OPENAI_MODEL` começa em `gpt-4.1`; altere conforme os modelos disponíveis na sua conta. GPT e Claude podem ser configurados por projeto em **Configurações → IA**, com suas próprias credenciais. A aba **APIs** dos projetos mantém as integrações genéricas por nome/alias. Uma chave de Claude não pode ser usada como chave de OpenAI: selecione o provedor correspondente.

Se cadastrar o serviço manualmente, defina também `NODE_VERSION=24.19.0`, `NODE_ENV=production` e uma `ACCESS_PASSWORD` aleatória com pelo menos 20 caracteres. Nunca coloque credenciais em variáveis expostas ao frontend.

O plano gratuito pode suspender o processo após inatividade; a primeira abertura pode demorar. Como os dados são temporários, suspensão, reinício e novo deploy podem descartá-los. Confira os limites e a disponibilidade do plano no Render antes de publicar.

## Como os dados deste teste funcionam

- Cada aba aberta recebe uma identificação aleatória mantida somente na memória do JavaScript. O servidor cria um SQLite **na RAM do servidor**, isolado para essa aba. Não há banco externo nem arquivo de banco em disco.
- Contas, projetos, código e credenciais desse banco são temporários. Recarregar inicia outra sessão. Sair da conta encerra a sessão e remove o banco correspondente. **Exporte o código antes de fechar ou recarregar.** Esta edição não serve para guardar trabalho permanente.
- Chat e anexos ficam na memória da aba. Arquivos são processados no servidor durante a solicitação e encaminhados ao provedor escolhido quando necessário. A retenção do provedor segue sua própria política.
- O navegador tenta encerrar a sessão ao sair da página. Esse aviso pode falhar se o navegador fechar abruptamente. O servidor elimina sessões após 30 minutos sem solicitações ou no limite de 2 horas, com verificação periódica. Operações ativas são abortadas antes do fechamento do banco.
- Há no máximo 16 sessões temporárias e 4 chamadas API simultâneas. A geração tem limite global adicional de 10 chamadas/minuto e 300/dia por processo. Esses limites reiniciam com o servidor e não substituem limites de gasto na conta de IA.
- A chave mestra do cofre é aleatória e existe somente na RAM do processo. As chaves do cofre não são incluídas em exports. Excluir uma chave do cofre não a revoga no provedor.

A senha de acesso do Render protege todo o aplicativo antes do cadastro temporário. Compartilhe-a somente com quem deve usar sua API. Não há recuperação de conta, envio de e-mail, MFA ou banco permanente nesta edição de teste. O acesso à hospedagem continua sujeito às regras e bloqueios da rede utilizada.

Esta é uma cópia adaptada para Render. Ela não modifica a hospedagem anterior nem migra suas contas, dados ou chaves.

## Desenvolvimento local opcional

Requer Node.js 24 e npm. Não é necessário VS Code. Para usar somente o aplicativo hospedado, não é necessário instalar nada no computador.

```sh
npm ci
npm run build
```

Copie `.env.example` para `.env` e preencha localmente a chave e uma senha de acesso forte. Inicie com:

```sh
node --env-file=.env server/start.mjs
```

Abra `http://localhost:3000`. Em hospedagem, use HTTPS. `npm start` lê as variáveis do ambiente; ele não carrega `.env` automaticamente.

## Verificação e limites da prévia

```sh
npm run build
node scripts/validate-artifact.mjs
npm test
```

Os testes cobrem autenticação, autorização, isolamento entre contas e abas, SQLite real em memória, descarte de sessões, transações, proteção de segredos, anexos, exportação e contratos de geração. As chamadas aos modelos são simuladas; não comprovam crédito, acesso a modelos ou disponibilidade das APIs reais. Não foi realizada validação visual em navegador nesta adaptação.

A prévia compila React/JSX, CSS e imports locais com React, react-dom, react-router-dom e lucide-react. O servidor compila e resolve imports antes de aplicar uma geração; se falhar, solicita uma correção ao mesmo provedor, no máximo uma vez, dentro do prazo total de 100 segundos e das cotas de IA. A correção pode consumir outra chamada à API. Se continuar inválida, preserva os arquivos anteriores. Compilar não comprova comportamento ou segurança.

O chat orienta a IA a aplicar o pedido no projeto e responder só com o resultado ou uma pergunta essencial. Os arquivos são enviados internamente na resposta estruturada e aplicados pelo servidor; não exigem que o usuário copie código, crie estruturas ou exporte para testar.

## Backend no próprio Dev Studio

O mesmo serviço Node.js executa a lógica de teste de cada projeto em um worker com QuickJS/WASM. Código gerado nunca é importado ou avaliado pelo Node principal. O handler em `server/handler.js` recebe request e ctx e retorna `{status, headers, body}`. O SDK fornece CRUD em coleções sobre um SQLite real em RAM e scrypt com salt para senhas. Não há outro serviço ou hospedagem por projeto.

As chamadas fetch('/api/...') da interface React passam por uma ponte de mensagens. O pai valida a janela de origem e fixa o destino no projeto autenticado, com verificação de versão/propriedade. A prévia continua sem same-origin e sem acesso direto à rede. Cookies do aplicativo são mantidos em um jar temporário próprio de cada projeto; não recebe os cookies do Dev Studio. Eles exigem HttpOnly, Secure e SameSite, e não são retornados ao JavaScript da prévia.

O backend de teste aceita JavaScript, promises e imports locais. Não fornece módulos Node/npm, fs, process, rede externa, timers, uploads binários ou jobs. Acesso a APIs externas e compartilhamento permanente precisam de etapas próprias; cadastrar uma chave no cofre não conecta o sandbox a um serviço. Os adaptadores Node/Express e o SDK seguem na exportação opcional para continuidade fora da plataforma.

Há no máximo 3 backends de teste ativos no processo. Cada um possui SQLite em memória com limite de páginas de aproximadamente 2 MB, até 5 mil registros e 8 mil caracteres por registro. Listagens têm até 100 itens. O guest tem 24 MB de memória e limite de execução de aproximadamente 1,8 segundo, com watchdog adicional do host. O SDK limita operações por chamada e hashing de senhas. Reiniciar, excluir o projeto ou encerrar a sessão descarta seu banco e seus cookies. Alterar o handler conserva o banco enquanto o worker está ativo.

O produto está em modo de teste. As skills orientam os projetos; validações, autorização de negócio, fluxos reais e controles de cada software precisam ser implementados e verificados. Os testes de isolamento não substituem auditoria do runtime ou uma infraestrutura de produção multiusuário.

As skills editáveis estão em `docs/skills/`; após alterá-las, execute `npm run skills:sync`. A exportação dos projetos inclui orientações portáveis e as skills fixas.
