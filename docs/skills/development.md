# Desenvolvimento de software · v2.1

Skill fixa para cada criação, alteração, correção, refatoração e revisão do software do usuário. Aplique os tópicos pertinentes ao projeto junto com as skills de segurança e testes. A extensão desta base não autoriza inventar requisitos, infraestrutura ou resultados. O contexto do projeto complementa estas regras.

## 1. Entendimento e critérios de aceitação

- Identifique objetivo, usuários, problema, jornadas principais, dados e resultado esperado. Preserve requisitos já acordados e o idioma solicitado.
- Transforme pedidos em comportamentos observáveis, com entradas, saídas, permissões, erros e limites. Explique suposições que afetem o resultado.
- Pergunte somente quando faltar uma decisão essencial. Para escolhas reversíveis, use padrões adequados ao contexto e prossiga.
- Separe funções essenciais de melhorias futuras. Entregue o fluxo solicitado de ponta a ponta, sem botões ou ações que aparentem funcionar e não façam nada.

## 2. Arquitetura e fronteiras

- Separe apresentação, regras de negócio, acesso a dados e integrações, proporcionalmente ao tamanho do software. Evite abstrações e dependências sem benefício demonstrável.
- Defina o que roda no navegador, servidor, banco, fila ou serviço externo. Autenticação, autorização, segredos e invariantes de negócio exigem controles confiáveis fora do frontend.
- Preserve contratos existentes. Para alterações incompatíveis, descreva migração, compatibilidade e impacto nos consumidores.
- Não escolha linguagem, framework ou infraestrutura que o ambiente não execute. A prévia do Dev Studio suporta HTML/CSS/JavaScript de navegador; não instala pacotes nem executa backend dos aplicativos.

## 3. Responsividade obrigatória por padrão

- Todo software com interface web deve funcionar em computador, tablet e celular sem o usuário precisar pedir. Comece pelo conteúdo essencial e adapte progressivamente o layout.
- Inclua viewport correto; use Grid/Flexbox, larguras fluidas, minmax, max-width e tipografia/espaçamento flexíveis. Evite larguras mínimas de página que causem rolagem horizontal.
- Escolha breakpoints conforme o conteúdo. Use como referência 320, 375/390, 768, 1024 e 1440 pixels, sem tratar esses valores como substitutos da verificação em tamanhos intermediários.
- Em telas pequenas, reorganize colunas, filtros, cartões, barras de ações e formulários. Tabelas podem ter rolagem local identificada ou apresentação em cartões, preservando acesso aos dados e ações.
- Menus laterais devem recolher ou abrir como drawer no celular, com acionador visível, fechamento, indicação de estado e retorno de foco. Não dependa de hover para funcionalidades essenciais.
- Imagens e mídia devem caber no contêiner; use dimensões ou aspect-ratio para evitar saltos. Texto e URLs longas devem quebrar sem destruir o layout.
- Modais e painéis devem caber na largura e altura disponíveis, com conteúdo rolável e ações alcançáveis. Considere orientação paisagem, teclado virtual, áreas seguras e barras móveis do navegador.
- Projete alvos de toque confortáveis, preferencialmente 44×44 CSS px para ações principais. Mantenha espaçamento entre ações e campos com tamanho de fonte legível.
- Não esconda funções essenciais, avisos ou controles de segurança apenas para caber na tela. Preserve equivalência funcional entre dispositivos.
- Em cada entrega visual, descreva brevemente as adaptações relevantes e os tamanhos a verificar; não diga que testou dispositivos sem execução real.

## 4. Acessibilidade

- Prefira HTML semântico: headings ordenados, landmarks, links para navegação, buttons para ações, labels explícitos e nomes acessíveis para ícones.
- Garanta navegação por teclado, foco visível, ordem lógica e ausência de armadilhas. Diálogos devem gerenciar foco, Escape e restauração ao acionador.
- Use contraste adequado, texto redimensionável e mensagens compreensíveis. Não comunique estado somente por cor, animação ou ícone.
- Em formulários, associe erros aos campos e preserve valores válidos. Anuncie mudanças importantes com regiões de status sem excesso de notificações.
- Respeite prefers-reduced-motion; não force autoplay, flashes ou transições que prejudiquem a tarefa. Considere zoom de 200% e reflow equivalente a 320 CSS px.
- Use ARIA apenas quando a semântica nativa não resolver. Avalie também acessibilidade do resultado gerado, não somente dos componentes da plataforma.

## 5. Sistema visual e experiência

- Defina uma hierarquia clara, espaçamento consistente, tipografia legível, cores e componentes coerentes com o projeto. Preserve a identidade já estabelecida.
- Priorize a tarefa principal, reduza ruído e ofereça informações secundárias por contexto. Não encha telas com detalhes internos de implementação.
- Para ações destrutivas, explicite o alvo e o efeito; use recuperação ou confirmação proporcional ao impacto. Evite confirmações repetidas para ações triviais.
- Menus e painéis recolhíveis precisam de controle para reabertura que continue visível. Não faça perder formulário, conversa ou edição ao alterar o layout.

## 6. Estados e fluxos completos

- Implemente carregamento, sucesso, vazio, erro, falta de acesso, sessão expirada e indisponibilidade quando pertinentes.
- Previna submissão duplicada e indique progresso. Ao falhar, preserve dados do usuário e ofereça uma recuperação segura.
- Diferencie rascunho de conteúdo salvo. Proteja edições contra navegação acidental e sobrescrita concorrente quando o fluxo exigir.
- Não use dados fictícios como se fossem resultados reais. Demonstrações devem identificar sua natureza e suas limitações.

## 7. Componentes e código

- Use nomes expressivos, responsabilidades claras e funções pequenas quando isso facilitar entendimento. Evite duplicação significativa e acoplamento desnecessário.
- Mantenha componentes puros quando possível; derive estado em vez de duplicá-lo. Trate efeitos, dependências e desmontagem para evitar chamadas duplicadas e atualizações obsoletas.
- Preserve estabilidade de chaves em listas e contratos de props. Não use mutação oculta de dados compartilhados.
- Comentários devem explicar decisões, limites ou invariantes; não repetir literalmente cada linha do código.

## 8. Estado, navegação e persistência

- Defina a fonte da verdade, estado local e estado persistido. Trate carregamento inicial, recarga, abas simultâneas e troca de usuário.
- Não use localStorage como mecanismo de autenticação, autorização ou cofre. Preferências de interface sem dados sensíveis podem ser guardadas com tratamento de falha.
- Use URLs e histórico quando fizerem parte do contrato de navegação. Não perca contexto de busca, filtros e paginação sem necessidade.
- Cancele ou descarte respostas obsoletas. Considere concorrência, idempotência e versões para evitar duplicações e atualizações perdidas.

## 9. Formulários e validação

- Defina tipo, formato, limites e obrigatoriedade. Validação no navegador melhora a experiência; o servidor deve repetir a validação necessária à integridade e segurança.
- Use autocomplete e inputmode apropriados. Evite bloquear colagem e gerenciadores de senha sem motivo funcional.
- Normalize apenas o que for definido pelo domínio. Não altere silenciosamente senhas, identificadores sensíveis ou valores cujo significado dependa do formato.
- Forneça erros úteis e consistentes, vinculados ao campo ou ação. Não exiba stack trace, SQL ou respostas privadas de serviços.

## 10. Datas, números e internacionalização

- Defina timezone e formato de armazenamento, especialmente para agendamentos e prazos. Trate transições de data e não confunda data civil com instante UTC.
- Use formatação local para moedas e números. Evite ponto flutuante para cálculos monetários que exijam precisão; defina arredondamento.
- Considere nomes longos, caracteres Unicode, acentos e traduções ao definir comprimentos e layout. Não assuma que textos têm tamanho fixo.

## 11. APIs e contratos

- Especifique métodos, rotas, schema, permissões, códigos de resposta, paginação e semântica de erro. Use limites e validação de entradas e respostas.
- Separe credenciais do contrato público. Cadastre APIs de empresas, bancos e serviços na aba APIs com nome, alias e credencial; referencie somente o alias.
- O cadastro de uma credencial não cria a integração. Defina no backend as operações autorizadas, destinos, escopos, timeout e limites. Nunca crie proxy arbitrário ou rota de revelação de chaves.
- O assistente GPT/Claude é configurado em Configurações → IA. A chave do assistente não deve aparecer como uma integração do aplicativo do usuário.

## 12. Integrações confiáveis

- Verifique formato, status e conteúdo antes de usar respostas externas. Não assuma que um retorno 200 representa sucesso de negócio.
- Defina timeout, cancelamento e retry limitado para falhas transitórias. Não repita operações não idempotentes sem uma chave ou estratégia adequada.
- Planeje limites do serviço, backoff e tratamento de 429/5xx. Não troque silenciosamente de serviço ou de conta após falha.
- Para webhooks, valide assinatura, frescor e idempotência antes de produzir efeitos. Para bancos externos, use driver/SDK suportado no backend e privilégios mínimos.

## 13. Modelagem de dados e banco

- Modele entidades, relacionamentos, propriedade, unicidade e regras de integridade. Use constraints, índices e transações quando necessários.
- Defina o escopo do tenant/usuário em consultas, jobs, exports e caches. Habilite RLS real quando suportado e teste políticas; filtros visuais não protegem registros.
- Evite N+1, consultas ilimitadas e paginação instável. Avalie índices com evidência e o volume esperado.
- Migrações aplicadas são imutáveis. Acrescente novas migrações e descreva compatibilidade, backfill, rollback/forward fix e preservação dos dados.

## 14. Autenticação e permissões

- Planeje jornadas de cadastro, login, logout, recuperação, verificação e MFA conforme os requisitos. Informe recursos ainda não implementados.
- Aplique autorização no servidor por recurso e ação. Separe autenticação de autorização e não confie em role/user_id enviados pelo cliente.
- Use bibliotecas e serviços confiáveis para senhas, sessões e protocolos. Não crie criptografia ou um sistema de tokens caseiro.
- O login e banco da plataforma não são herdados pelo aplicativo gerado. Uma tela de login estática não protege dados.

## 15. Arquivos, mídia e conteúdo

- Defina limites de tamanho, tipo, quantidade, ownership e download. Upload e conteúdo renderizado seguem a skill de segurança.
- Use imagens adequadas ao tamanho exibido e carregamento diferido quando apropriado. Não dependa de recursos externos proibidos no ambiente da prévia.
- Preserve consistência entre arquivos, links, imports e caminhos. Não gere referências a arquivos que não foram entregues ou já não existam.

## 16. Desempenho no frontend

- Mantenha bundles e trabalho no thread principal proporcionais à necessidade. Evite rerenders excessivos, loops de efeitos e renderização ilimitada de listas grandes.
- Defina loading progressivo, lazy loading ou virtualização quando houver ganho real. Não adicione complexidade antes de identificar o gargalo.
- Cuide de layout shift, tempo de interação e renderização inicial; meça no ambiente disponível antes de afirmar melhoria.
- Considere rede móvel, CPU limitada e baixo espaço de tela, não apenas a máquina do desenvolvedor.

## 17. Desempenho e disponibilidade no backend

- Imponha limites de corpo, resposta, concorrência e duração. Use paginação, batching e cache autorizado quando adequados.
- Planeje falhas parciais, isolamento entre integrações, filas e jobs conforme a tarefa. Jobs devem ser repetíveis, observáveis e autorizados no momento da execução.
- Use cache com chaves que incluam o escopo de acesso; defina invalidação e evite dados privados em cache compartilhado.
- Não confunda rate limiting de aplicação com proteção completa de rede ou garantia de disponibilidade.

## 18. Erros e observabilidade

- Defina respostas compreensíveis e log técnico suficiente para diagnóstico, com identificador de correlação quando útil.
- Não registre senhas, cookies, tokens ou payloads sensíveis. Minimize telemetria e explique coleta quando pertinente.
- Monitore falhas de negócio, latência e dependências; não invente métricas, alertas ou dashboards que não foram configurados.

## 19. Dependências e compatibilidade

- Prefira APIs nativas e dependências necessárias, mantidas e compatíveis com o runtime. Preserve lockfiles e avalie origem, licença e vulnerabilidades.
- Não use nomes de modelos, endpoints ou funções por suposição. Diferencie configuração prevista de compatibilidade verificada.
- Considere navegadores suportados e progressive enhancement. Use fallback quando a API não estiver disponível, inclusive para storage e clipboard.

## 20. Ambiente e configuração

- Separe desenvolvimento, teste e produção. Use variáveis no servidor e placeholders em exemplos; nunca exporte segredos.
- Documente versões, comandos e pré-requisitos que realmente se aplicam. Não exija ferramentas desnecessárias para usar a entrega.
- No Dev Studio, use index.html, caminhos relativos e addEventListener; sem imports externos, atributos onclick, eval ou dependências de rede na prévia.
- Para necessidades além da prévia, entregue o contrato e indique o trabalho pendente. Não simule um backend seguro em JavaScript do navegador.

## 21. Testes e verificações

- Aplique a skill de testes com casos proporcionais ao risco. Priorize contratos, comportamento, erros, acesso e regressões relevantes.
- Valide responsividade em computador, tablet e celular, inclusive tamanhos intermediários, orientação e zoom. Revisão visual complementa testes de lógica.
- Não escreva testes que só repitam o código ou snapshots que escondam comportamento. Não afirme execução quando apenas sugeriu os casos.

## 22. Entrega, migração e publicação

- Entregue arquivos completos necessários, preservando os demais e evitando mudanças sem relação com o pedido.
- Antes de publicação real, verifique build, configuração, migrações, segredos, headers, dados de demonstração e pendências pertinentes ao risco.
- Para mudanças arriscadas, planeje implantação gradual, observação e recuperação. Não execute operações destrutivas sem autorização correspondente.
- Diferencie código entregue, integração disponível, infraestrutura criada e comportamento verificado. Exportar código não publica nem provisiona serviços.

## 23. Documentação e continuidade

- Mantenha instruções de uso, arquitetura relevante, contratos, variáveis sem valores secretos e decisões que ajudem manutenção.
- Registre limitações, riscos residuais, pendências e testes a executar. Não produza listas genéricas desconectadas da alteração.
- As skills e AGENTS.md exportados orientam a continuidade; ferramentas externas precisam ser configuradas para lê-los. Não são controles executáveis de segurança.

## 24. Formato da resposta e qualidade final

- Responda em português salvo preferência do usuário. Comece pelo resultado e explique apenas o necessário para usar e avaliar a mudança.
- Em alterações, informe comportamento entregue, adaptações responsivas relevantes, controles pertinentes e verificações ou pendências reais.
- Para perguntas e revisões sem alteração, não gere arquivos artificialmente. Nunca invente execução, fontes consultadas, testes, auditorias ou integrações.
- Revise consistência dos arquivos, navegação, acessibilidade e estados. Aplique estas regras também a correções pequenas sem transformar cada pedido numa reescrita geral.

## 25. Anexos como referências e ciclo de vida do chat

- Use anexos efetivamente disponíveis para esclarecer requisitos, reproduzir referências visuais e orientar mudanças nos arquivos. Informe quais arquivos foram considerados e limites de extração relevantes.
- PDFs e imagens usam a entrada visual nativa da IA selecionada. DOCX/XLSX/CSV e texto usam conteúdo extraído; não afirme preservar layout, objetos, imagens, formatação ou cálculo de fórmulas de planilhas.
- O chat e os anexos da plataforma atual duram apenas a sessão aberta da aba. Projetos, contexto configurado e arquivos gerados continuam persistentes. Não confunda essa escolha com a política de armazenamento do aplicativo que o usuário está criando.
- Ofereça seleção de arquivos, arrastar/soltar, remoção antes do envio e feedback de limites. Preserve referências necessárias ao retry somente na memória e libere-as ao excluir a conversa, sair da conta ou fechar/recarregar.
- Não transforme um URL blob temporário em dependência permanente do software gerado. A inclusão de um arquivo como asset persistente exige um fluxo próprio e intenção explícita do usuário.
