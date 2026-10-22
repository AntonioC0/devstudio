# Testes e qualidade · v2.1

Skill fixa para validar o software que cada pessoa desenvolve. Use a base de acordo com o risco, a arquitetura e a mudança. Não trate uma lista de testes como prova de execução ou certificação de segurança. No chat do Dev Studio não há executor de testes; proponha verificações e identifique essa limitação. Em ambiente externo com ferramentas disponíveis, só informe resultados realmente observados.

## 1. Estratégia e risco

- Relacione objetivo, critérios de aceitação, jornadas críticas e riscos. Priorize perda de dados, acesso indevido, cobrança, indisponibilidade e regressões do fluxo alterado.
- Escolha o nível apropriado: unidade para regras isoladas, integração para contratos reais, ponta a ponta para jornadas e revisão visual para apresentação.
- Defina o escopo e os limites da verificação. Uma suíte verde não significa que todos os comportamentos, dispositivos ou ataques foram cobertos.

## 2. Casos verificáveis

- Descreva pré-condições, ação, dados e resultado esperado. Cubra caminho feliz, erro, vazio, limites e transições relevantes.
- Para bugs, proponha primeiro um caso que reproduza o defeito e depois a regressão esperada. Prefira observar a interface/contrato público.
- Evite testes que copiem a implementação, comparem apenas texto estático ou dependam de detalhes internos sem motivo.
- Não crie testes desproporcionais para mudanças reversíveis de baixo impacto; aproveite verificações existentes e inspecione o resultado relevante.

## 3. Dados e ambientes de teste

- Use dados fictícios, contas separadas e credenciais de teste protegidas. Não copie dados pessoais ou secrets de produção para fixtures, gravações ou snapshots.
- Isole testes e limpe somente recursos criados para eles. Não rode testes destrutivos ou de carga em produção sem autorização e limites explícitos.
- Controle relógio, timezone, aleatoriedade e identificadores quando necessário à reprodução. Evite testes que dependam de ordem ou estado compartilhado.

## 4. Testes de unidade

- Cubra regras de negócio, validações, cálculos, permissões e transformações com exemplos representativos e limites.
- Inclua valores ausentes, strings vazias, Unicode, comprimentos extremos, zero, negativos e precisão numérica quando aplicáveis.
- Use testes orientados a propriedades ou fuzzing com limites quando houver invariantes complexos. Fixe a semente ao registrar um caso de falha.

## 5. Contratos de APIs

- Verifique schema de entrada/saída, Content-Type, métodos, status, headers, paginação e erros. Rejeite campos extras em entidades sensíveis.
- Cubra JSON inválido, corpo excessivo, tipos trocados, duplicações, IDs inexistentes e tentativas de alterar proprietário ou papel.
- Teste timeout, cancelamento, 401/403/404/409/422/429/5xx e respostas externas malformadas. Um mock 200 isolado não verifica uma integração real.
- Verifique que respostas e erros não revelam tokens, cookies, ciphertext desnecessário, SQL ou detalhes privados de serviços.

## 6. Banco e migrações

- Use o banco real ou equivalente compatível quando o comportamento depender de SQL, constraints, transações e semântica do driver.
- Verifique unicidade, chaves estrangeiras, cascatas, nulidade, índices relevantes e rollback de falhas parciais.
- Aplique migrações numa cópia de teste com dados anteriores e verifique preservação e novos defaults. Não edite migrações já aplicadas para fazer o teste passar.
- Teste paginação estável e limites com conjuntos grandes; avalie consultas e N+1 quando houver risco de desempenho.

## 7. Autenticação e sessão

- Cubra cadastro, login válido/inválido, logout, sessão ausente/expirada/revogada e credenciais incorretas. Evite enumeração de contas.
- Verifique hashing de senhas com salt e parâmetros adequados, ausência de plaintext e comparação pelo mecanismo aprovado.
- Confira atributos e escopo dos cookies, fixação/rotação de sessão e invalidação correspondente. Para recuperação, teste token expirado, usado e adulterado se o fluxo existir.
- Se MFA, SSO ou confirmação de e-mail não existirem, registre a lacuna em vez de declarar o fluxo testado.

## 8. Autorização, tenants e RLS

- Use no mínimo usuário A, usuário B e anônimo; inclua papéis distintos e tenant separado quando aplicável.
- Tente ler, criar, alterar, excluir, listar, exportar e acessar recursos filhos usando IDs de outro usuário, inclusive diretamente pela API.
- Teste mass assignment com user_id, tenant_id, role e campos administrativos; não basta que a interface esconda ações.
- Para RLS real, teste SELECT/INSERT/UPDATE/DELETE com os papéis e sessões usados pela aplicação, incluindo novos registros e funções privilegiadas. Conta de administrador pode contornar RLS e não comprova a política.
- Em bancos sem RLS, verifique filtros no servidor e descreva corretamente o alcance; não declare política de banco inexistente.

## 9. Segredos e criptografia

- Busque segredos detectáveis em código, bundle, HTML, source maps, logs, erros, mensagens, arquivos e exports.
- Para o cofre, verifique ciphertext sem plaintext, nonces diferentes, AAD vinculada ao usuário/projeto/registro, falha por adulteração e ausência de chave mestra.
- Verifique que apenas o servidor resolve aliases após autorização e que não existe endpoint de revelação. APIs de integração não devem ser selecionáveis como assistente.
- Teste rotação e limpeza de valores antigos/novos, preservação de projetos alheios e limites do detector. Use valores sintéticos, nunca uma chave real em fixture.
- Cadastro/exclusão no cofre não equivale a teste de validade, integração ou revogação no serviço de origem.

## 10. Injeções e entradas hostis

- Verifique SQL/NoSQL injection, XSS, traversal, prototype pollution, HTML não confiável, campos ocultos e nomes de arquivo perigosos nos fluxos pertinentes.
- Para fetch server-side, teste destinos proibidos, redirecionamentos, redes privadas e encaminhamento indevido de headers quando houver URLs configuráveis.
- Para upload, teste tamanho, MIME/extensão incompatíveis, nomes maliciosos, conteúdo ativo e arquivos comprimidos excessivos, com limites controlados.
- Não execute payloads perigosos contra terceiros. Use recursos isolados e observações compatíveis com a autorização recebida.

## 11. Navegador e isolamento

- Verifique CSP, nonces diferentes por resposta, bloqueio de inline handlers/eval, headers pertinentes e ausência de secrets no HTML.
- Teste origem cruzada, CSRF, métodos indevidos e políticas CORS sem confundi-las com autenticação.
- Em prévias, confirme sandbox sem same-origin, bloqueio de rede, navegação superior, popups e acesso a storage/cookies da plataforma.
- Código de demonstração não deve fingir que autenticação no navegador protege dados reais.

## 12. Concorrência e consistência

- Simule clique repetido, retry com mesmo identificador, requisições simultâneas, abas concorrentes, resposta fora de ordem e expiração do lock.
- Verifique que não há mensagens, pedidos, cobranças ou arquivos duplicados e que uma edição antiga não sobrescreve a nova silenciosamente.
- Teste falha no meio de uma operação, rollback/compensação e retomada segura. Verifique autorização novamente em jobs quando necessário.

## 13. Integrações, mocks e webhooks

- Use mocks para erros difíceis de reproduzir, mas deixe explícito o que foi simulado. Verifique formato e headers específicos de cada serviço.
- Faça smoke tests reais somente com configuração, conta e autorização disponíveis, sem expor credenciais. Não afirme integração real com base apenas no mock.
- Para webhooks, teste assinatura válida/inválida, corpo alterado, replay, evento repetido e ordem inesperada; confirme idempotência dos efeitos.
- Verifique que uma falha não encaminha dados silenciosamente para outro provedor ou ambiente.

## 14. Jornadas ponta a ponta

- Cubra os fluxos principais com contas e dados controlados: entrar, criar, editar, persistir, recarregar, excluir e recuperar de erro, conforme o produto.
- Verifique que botões, links, atalhos e ações fazem o que comunicam. Não aceite fluxo completo com etapas críticas simuladas sem indicação.
- Ao recarregar ou trocar de conta, confirme isolamento, persistência correta e ausência de estado residual do usuário anterior.

## 15. Responsividade obrigatória

- Valide computador, tablet e celular em referências de 320, 375/390, 768, 1024 e 1440 CSS px e em larguras intermediárias pertinentes.
- Verifique retrato e paisagem, zoom 200%, texto grande, teclado virtual e altura reduzida quando houver ferramentas disponíveis.
- Observe rolagem horizontal global, textos cortados, botões fora da tela, sobreposição de barras, menus, modais e ações inacessíveis.
- Confirme adaptação de tabelas, formulários, filtros e cartões. Rolagem local de tabela deve ser utilizável sem deslocar a página inteira.
- Menus e painéis recolhíveis devem abrir, fechar e reabrir sem perda de dados. O acionador de restauração deve permanecer acessível em todos os modos.
- Em telas de toque, teste alvos, espaçamento e ações sem hover. Em computador, confirme uso por teclado e com ponteiro.
- Uma prévia redimensionada ajuda a verificar layout, mas não substitui testes em navegador/dispositivo real. Não declare compatibilidade testada sem observação.

## 16. Acessibilidade

- Teste ordem e visibilidade do foco, Tab/Shift+Tab, Enter/Space e Escape. Modais devem reter foco enquanto abertos e devolvê-lo ao fechar.
- Verifique labels, nomes acessíveis de ícones, headings, landmarks, mensagens de erro e anúncios de status.
- Avalie contraste, reflow, leitores de tela quando disponíveis, preferências de movimento reduzido e informação que depende apenas de cor.
- Ferramentas automáticas identificam parte dos problemas; complementam revisão manual e não certificam acessibilidade completa.

## 17. Estados, conteúdo e experiência

- Teste listas vazias, carregamento lento, serviço indisponível, erro após edição, dados extensos e ausência de permissão.
- Confirme preservação de rascunhos e valores após falha, feedback de sucesso, bloqueio de submissão duplicada e recuperação compreensível.
- Verifique nomes longos, acentos, Unicode, URLs, datas, moedas, limites e transições de timezone relevantes.

## 18. Desempenho e disponibilidade

- Defina orçamento e carga representativos antes de medir. Observe tempo de resposta, interação, layout shift, bundle, memória e consultas pertinentes.
- Considere rede móvel lenta, CPU limitada, listas grandes e falhas de dependência. Evite benchmarks sem representatividade.
- Testes de carga precisam de ambiente, limites, autorização e critério de parada. Não os execute automaticamente contra o Site publicado ou terceiros.
- Relate hardware, ambiente, dados e método ao comparar desempenho. Não invente percentuais de melhoria.

## 19. Compatibilidade e regressão visual

- Verifique navegadores suportados, fallbacks de APIs e diferentes entradas. Layouts baseados em uma única captura não provam comportamento responsivo.
- Faça revisão visual de hierarquia, legibilidade, estados e áreas críticas; quando usar snapshots, revise diferenças relevantes em vez de aprová-las em lote.
- Não instale nem improvise ferramenta de navegação fora das capacidades autorizadas do ambiente. Se inspeção visual não estiver disponível, informe o limite e faça as verificações possíveis.

## 20. Build, dependências e publicação

- Execute os checks exigidos e proporcionais à alteração. Verifique build, imports, arquivos referenciados, artefato e migrações pertinentes.
- Avalie dependências, lockfiles e configurações públicas. Não inclua secrets ou dados reais em artefatos de teste/export.
- Depois de publicar, faça smoke checks adequados sem criar dados de produção desnecessários. Sucesso de deploy não prova o funcionamento de todas as jornadas.

## 21. Diagnóstico de falhas e testes instáveis

- Reproduza o caso, registre dados mínimos não sensíveis e encontre a causa. Não aumente timeout ou remova assertion apenas para obter verde.
- Evite waits arbitrários; espere pelo estado ou evento observável. Faça retry de teste apenas com justificativa e acompanhamento da causa.
- Após correção, rode os testes afetados e checks necessários. Não repita indefinidamente uma suíte já aprovada sem nova alteração ou dúvida concreta.

## 22. Relato honesto da verificação

- Diferencie claramente: executado e aprovado, executado com falha, simulado, sugerido, não executado e não aplicável.
- Relacione achados a impacto, fluxo/arquivo, reprodução e correção. Priorize defeitos demonstráveis.
- Informe comandos ou procedimento, ambiente e limites que mudem a conclusão. Não diga “100% seguro”, “todos os dispositivos” ou “integração verificada” sem evidência correspondente.
- Na entrega, resuma os testes relevantes e pendências reais, sem despejar a base inteira a cada resposta.

## 23. Anexos e privacidade da sessão

- Verifique imagens/PDFs nos formatos nativos de cada provedor e documentos/planilhas como texto extraído. Cubra tabelas, múltiplas abas, células, fórmulas não executadas, texto sem leitura e truncamentos.
- Teste assinaturas falsas, extensões ativas, documentos protegidos, entidades XML, traversal, expansão ZIP excessiva, arquivo vazio e limites individuais/agregados.
- Confirme autenticação, origem e propriedade do projeto antes da leitura. Teste erros, retry, requisição repetida e ausência de fallback, sem gravar texto ou anexos no banco.
- Verifique que fechar/recarregar produz uma nova sessão vazia, enquanto o código gerado persiste. Sair da conta deve limpar as referências locais e impedir exposição para o próximo usuário.
- Confirme que nomes, binários, texto de anexos e respostas não aparecem em registros de controle, logs, storage do navegador, exports automáticos ou object storage. Um teste com mock não verifica leitura visual real pelo provedor.
