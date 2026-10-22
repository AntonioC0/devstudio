# Dev Studio — teste no Render

Workspace com React, servidor Node.js 24 e SQLite em memória, preparado para hospedagem própria no plano gratuito do Render. Inclui contas com e-mail/senha, projetos, chat com anexos, prévia responsiva, exportação de código, cofre de APIs e skills fixas de segurança, desenvolvimento e testes.

## O que enviar ao GitHub

Envie **o projeto completo deste pacote**, com `package.json`, `package-lock.json`, `render.yaml`, `server/`, `client/` e as demais pastas na raiz do repositório. Não envie apenas o HTML e não envie o ZIP como um único arquivo dentro do repositório. Prefira um repositório privado.

Não envie `.env`, chaves reais, bancos, `node_modules/`, `.build/` ou `dist/`. O `.gitignore` já exclui esses itens. O `.env.example` contém somente campos vazios e exemplos públicos.

## Hospedar no Render

1. Conecte o repositório ao Render e crie um **Blueprint**, usando o `render.yaml` da raiz.
2. O Blueprint cria apenas um serviço web no plano **Free**, sem banco externo ou disco pago. Build: `npm ci && npm run build`. Inicialização: `npm start`. Health check: `/healthz`.
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

A prévia executa HTML, CSS e JavaScript em iframe isolado, sem rede. Ela não executa backend nem conecta automaticamente as APIs do cofre ao software gerado. As skills orientam os projetos; os controles de cada software precisam ser implementados e verificados no ambiente em que ele será executado.

As skills editáveis estão em `docs/skills/`; após alterá-las, execute `npm run skills:sync`. A exportação dos projetos inclui orientações portáveis e as skills fixas.
