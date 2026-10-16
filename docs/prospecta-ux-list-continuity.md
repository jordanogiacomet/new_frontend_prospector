# Continuidade de consultas e navegação — 14/10/2026

Continuação da revisão de UX do gestor, com ajustes locais nos filtros de
empresas e da pipeline, nas consultas vazias e no retorno aos detalhes de
importações e de empresas Fora da análise. A identidade visual existente e
as alterações anteriores do workspace foram preservadas.

## Comportamento

| Dificuldade | Ajuste |
| --- | --- |
| Alterar filtros podia parecer uma mudança na lista antes de aplicar. | Aviso de filtros pendentes nas empresas e na pipeline; os resultados continuam ligados à consulta aplicada. |
| Corrigir um rascunho exigia desfazer cada campo. | Descartar alterações dos filtros restaura os critérios e limpa erros sem navegar nem consultar novamente. O foco retorna a um campo presente. |
| Voltar na pipeline podia recuperar rascunhos e erros antigos. | O rascunho pertence à URL inteira; mudança de consulta ou de página restaura os filtros aplicados. |
| Um erro podia ficar escondido em Mais filtros. | A área abre e o primeiro campo inválido recebe foco. CNPJ inválido nas empresas também recebe foco. |
| Consulta sem correspondências exigia voltar aos filtros acima. | Limpeza explícita no estado vazio conserva o tamanho da página e, na pipeline, a ordenação aprovada. |
| Página vazia da pipeline exigia recuar uma página por vez. | Voltar à primeira página conserva os filtros aprovados. |
| Abrir um lote ou empresa Fora da análise perdia a posição na lista. | Links de detalhe carregam a paginação confirmada; o retorno aceita somente a lista correspondente e os parâmetros aprovados. |

Não foram adicionadas fontes de dados, permissões, endpoints, SQL, migrações,
mutações, integrações ou automações. As recusas de acesso, os totais nulos e
os fallbacks de acesso direto continuam com sua semântica anterior.

## Verificação

| Comando | Resultado |
| --- | --- |
| `pnpm lint` | Aprovado. |
| `pnpm typecheck` | Aprovado. |
| Testes focados dos componentes e retorno | 228 testes aprovados em 9 arquivos. |
| `pnpm test` | 2.658 testes aprovados em 139 arquivos. |
| `pnpm build` | Aprovado com configuração sintética e integrações desabilitadas. |
| `node tests/browser/manager-import-analysis.mjs` | 286 verificações aprovadas em 1366, 1440, 375 e 390 px. |
| `node --check` nos dois scripts de navegador | Aprovado. |
| `git diff --check` | Aprovado. |

O runner usado foi pnpm 10.34.4, a versão definida pelo projeto. Como não
estava no PATH, os comandos de verificação usaram `npx --yes pnpm@10.34.4`;
o build executou o mesmo pnpm já instalado com o ambiente preparado por
`scripts/build-safe.mjs:buildEnvironment()`. Nenhum valor real foi registrado.

Os testes de retorno cobrem URLs externas, caminhos de outras áreas,
fragmentos, caminhos normalizados e limites de paginação, além da ausência
de `returnTo` nas chamadas à API. Testes de filtros cobrem equivalência de
CNPJ, descarte local, mudança de página, ida/volta entre consultas e foco em
campos inválidos.

Após a revisão, a comparação do CNPJ passou a remover espaços antes de
normalizar a máscara, como já fazia o envio do formulário. Os 22 testes dos
filtros de empresas foram repetidos e aprovados com as três formas
equivalentes do mesmo CNPJ.

O navegador verificou aviso e descarte de filtros, ausência de nova consulta
durante edição/validação (com polling da consulta aplicada permitido), foco
no primeiro campo inválido, abertura de Mais filtros, mudança apenas de
página e retorno, limpeza e primeira página com parâmetros preservados e
detalhe de lote aberto na página 3 com 50 registros por página. Não houve
overflow horizontal, conexão externa, mutação inesperada ou erro de runtime.
Capturas exclusivamente sintéticas de filtros pendentes e validação foram
inspecionadas em desktop e celular. O servidor sintético foi encerrado ao
final; as imagens ficaram fora do repositório.

PostgreSQL e contratos remotos não integram esta revisão, que não altera
persistência nem serviços externos. O roteiro de navegador usa loopback,
identidade e respostas fictícias, bloqueia conexões externas e mutações
inesperadas; não comprova persistência real ou execução de integrações.
Nenhuma implantação ou ativação foi realizada.

Após o pedido posterior do proprietário, a aplicação foi publicada no Demo 3
na revisão 69, preservando banco e configurações. Detalhes e rollback:
[prospecta-ux-list-continuity-deploy.md](prospecta-ux-list-continuity-deploy.md).

Guia atualizado: [prospecta-manager-guide.md](prospecta-manager-guide.md).
