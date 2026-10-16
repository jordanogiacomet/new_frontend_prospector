# Revisão de UX para uso pelo gestor — 14/10/2026

Revisão e implementação local nas áreas de início, navegação, empresas,
importações, acompanhamento comercial, custos, ajuda e login. A identidade
visual existente foi preservada: fundo claro, texto escuro e verde para
orientação. Alterações anteriores no repositório foram mantidas.

## Melhorias aplicadas

| Dificuldade observada | Comportamento atualizado |
| --- | --- |
| A rotina comercial ficava atrás do roteiro de importação. | Início destaca o acompanhamento; perfis somente comerciais ou de custos também têm entrada útil. |
| Menu ocupava muito espaço no celular. | Menu recolhível com área atual visível, controles de teclado e descrições das áreas. |
| CNPJ exigia botão; estado/prioridade se aplicavam imediatamente. | Formulário único com Aplicar filtros ou Enter; atalhos de prioridade continuam explícitos e imediatos. |
| Seletores pareciam campos de texto. | Setas visíveis e rótulo Estado (UF). |
| Textos e espaços retardavam o acesso à lista. | Cabeçalho e filtros compactos, sem instruções repetidas ou prioridade duplicada. |
| Termos técnicos exigiam conhecimento da implementação. | Dados da empresa, Plano de contatos e mensagem preparada; estados de ausência/proteção/indisponibilidade continuam distintos. |
| Mensagem e contatos ficavam sob um rótulo vago. | Dados, mensagem e contatos identifica os recursos da empresa; texto revisado permanece ao recolher. |
| Atividades, contatos e notas pareciam registrar a mesma coisa. | Orientação diferencia contato registrado, outras ações realizadas e contexto interno. |
| Nenhum prazo parecia uma falha de consulta. | Sem prazo definido apenas para data nula; dados inválidos continuam indisponíveis. |
| Link de um lote podia parecer uma lista exclusiva daquele envio. | Abrir lista geral de empresas, com destaque secundário e explicação de abrangência. |
| Custos exigia tabela larga e leitura de identificadores longos. | Campos verticais no celular e identificação recolhida sob escolha explícita. |
| Ajuda escondia toda a orientação e login não destacava a marca. | Roteiro inicial conforme permissões e nome Prospecta visível no login. |

## Validação

| Verificação | Resultado |
| --- | --- |
| `pnpm lint` | Aprovado. |
| `pnpm typecheck` | Aprovado; tipos de rotas e TypeScript estrito. |
| `pnpm test` | 2.628 testes aprovados em 139 arquivos. |
| `pnpm build` | Aprovado com configuração sintética e integrações desabilitadas. |
| `node tests/browser/manager-import-analysis.mjs` | 222 verificações aprovadas em 1366, 1440, 375 e 390 px. |
| `node --check` nos dois scripts de navegador | Aprovado. |
| `git diff --check` | Aprovado. |

O `pnpm` não estava no PATH deste terminal; os comandos foram executados por
`npx --yes pnpm@10.34.4`, conforme a versão do projeto. O ambiente do build foi
preparado por `scripts/build-safe.mjs:buildEnvironment()`, sem ler nem registrar
valores reais de configuração. O servidor sintético foi encerrado após o UAT.

Revisão visual com capturas exclusivamente sintéticas de início, empresas,
importação, pipeline e acompanhamento. PostgreSQL e contratos de integrações
não foram executados nesta revisão, que não altera SQL, DTOs, APIs ou serviços
externos. Os testes de componentes e permissões fazem parte da suíte aprovada.

O navegador usa apenas identidade e dados fictícios, com APIs interceptadas e
conexões externas bloqueadas. As alterações comerciais existem na memória do
teste; esse roteiro não comprova persistência no PostgreSQL ou funcionamento
de n8n, contatos, mapas ou IA real. Nenhuma implantação, migração ou ativação
de integração foi realizada nesta revisão.

Guia de uso atualizado: [prospecta-manager-guide.md](prospecta-manager-guide.md).
