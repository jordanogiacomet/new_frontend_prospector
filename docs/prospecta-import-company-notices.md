# Confirmação visual por empresa processada

A confirmação no canto superior direito representa uma empresa com resultado
final de processamento aprovado nesta importação. O aviso mostra “Empresa
processada” e identifica a linha do CSV; recebimento do arquivo ou início do
processamento não geram esse aviso.

O browser consulta
`GET /api/imports/:id?processedCompaniesPage=1&pageSize=100`.
O envelope de lote é preservado e `meta.processedCompanies` contém somente
`available`, `data` com `source_row`/`processedAt`, `page`, `pageSize`, `total`
e `factSource: "producer_current_company_results_v1"`. Nomes, CNPJ, contatos,
CSV, recomendações e payloads não são expostos por esse complemento.

## Fonte e permissões

A fonte é uma leitura SELECT da projeção produtora atual, implementada em
`src/server/repositories/imports/processed-import-companies-repository.ts`.
Ela exige correspondência entre `company_validations` e seu último
`company_validation_runs`: identidade da empresa, lote, linha e análise
coincidem, a integridade é `OK` e o resultado é `INSERIDO_VALIDATION` ou
`CRM_DECIDIU_E_SALVO`. Identidades ambíguas são excluídas; os filtros de
visibilidade e os limites existentes das leituras produtoras são preservados.
`processedAt` vem de `company_validation_runs.run_created_at`; ele identifica
a data registrada da análise, sem estabelecer uma nova hora de encerramento.

O servidor exige `imports:read`, o flag de importações e a submissão da
organização antes de qualquer leitura individual. A leitura produtora exige
ainda `FEATURE_BATCH_OBSERVATION_ENABLED`, `import_batch_id` conhecido e modo
com dados de demonstração desligado. A visibilidade é resolvida a partir do
ator verificado. Falta de um desses requisitos de fonte retorna
`available:false`, `data:[]`, `total:null`; erro de consulta retorna erro seguro.
Zero é permitido somente após leitura autorizada bem-sucedida.

Esta fonte é uma projeção mutável de resultados atuais, independente dos
recibos app-owned e das contagens contratuais do lote. Não promove aceite,
`COMPLETED`, estado comercial ou recomendações, e não transforma contagens
indisponíveis de `BatchSummary` em zero.

## Observação visual

O upload com registro confirmado acompanha sua submissão com
`includeExisting:true`, incluindo resultados que já surgiram entre envio e
primeira consulta. Abrir a lista de importações ou um detalhe existente usa
`includeExisting:false`: a primeira leitura completa bem-sucedida estabelece
a referência e suprime resultados históricos.

A lista acompanha somente as submissões visíveis com identificador válido.
Atualizações com os mesmos identificadores mantêm a observação ativa; mudar
a página, retirar uma submissão ou sair da tela libera sua assinatura. O
provider da área privada conserva a referência e a deduplicação por
submissão/linha ao navegar entre telas, mesmo quando uma assinatura é liberada.

As consultas usam GET, páginas de até 100 resultados e intervalo de cinco
segundos, sem sobreposição, somente em `/imports*` com aba visível. Falha ou
leitura incompleta não avança a referência nem produz sucesso. 401/403 removem
a fila e encerram as observações; 404 encerra a observação da submissão afetada.
O encerramento operacional explícito com todas as linhas relatadas observadas
pode encerrar apenas o polling visual, sem alterar o estado contratual do lote.

Os avisos aparecem um por vez, fecham após seis segundos e permitem fechamento
imediato. Foco, ponteiro e aba oculta pausam o fechamento. Fila e deduplicação
persistem durante a sessão do layout privado; recarregar a aplicação reinicia
a sessão visual.

## Compatibilidade com o recebimento anterior

A migração app-owned `db/app/019_import_received_companies_forward.sql` e sua
publicação histórica continuam documentadas em
[prospecta-import-company-notices-deploy.md](prospecta-import-company-notices-deploy.md).
Essa publicação registra a versão anterior, cujo aviso representava recebimento.
A correção para processamento não exige nova tabela ou mutação produtora.

`receivedCompaniesPage` e `meta.receivedCompanies` permanecem compatíveis para
leitura dos recibos `ACCEPTED_ROW`; o provider visual consulta exclusivamente
`processedCompaniesPage`. Recibos têm apenas organização, submissão, linha e
data relatada, são append-only e não provam processamento. Recibos anteriores
à migração não são reconstruídos. Os grants SELECT/INSERT, constraints, trigger
e o rollback que recusa remover armazenamento populado permanecem vigentes.

Nenhum workflow, endpoint externo, papel produtor ou tabela produtora é
alterado por esta correção. O documento de deployment anterior é evidência
histórica; a publicação desta correção está em
[prospecta-import-processing-notices-deploy.md](prospecta-import-processing-notices-deploy.md).

## Verificação atual da confirmação de processamento

Node 22.19.0 e pnpm 10.34.4. O mesmo runner sintético externo usado abaixo
executou os gates desta correção, com bancos inacessíveis em loopback e
integrações desligadas.

| Comando | Resultado |
| --- | --- |
| `pnpm lint` | Aprovado sem warnings após os ajustes finais. |
| `pnpm typecheck` | Aprovado. |
| `pnpm test` | 2.840 aprovados em 142 arquivos. |
| `pnpm exec vitest run src/components/imports/import-company-notices.test.tsx` | 29 aprovados após o último ajuste de paginação; inclui três regressões adicionais à rodada geral. |
| `pnpm test:contract` | 98 aprovados; 57 remotos ignorados por falta de alvo/credenciais de teste. |
| `pnpm build` | Build local e build final da fonte isolada aprovados. |
| `node tests/browser/manager-import-analysis.mjs` | 302 checks aprovados em 1366, 1440, 375 e 390px. |
| `git diff --check` e sintaxe dos scripts de release/browser | Aprovados. |

Os 48 testes unitários do repositório e 72 testes da API estão incluídos na
rodada geral. Os 29 testes finais do provider também verificam que uma página
incompleta, um total alterado entre páginas ou linhas duplicadas não avançam
a referência histórica nem produzem aviso.

Integração PostgreSQL desta correção: 38 testes aprovados em PostgreSQL 16
descartável, exclusivo, porta 55432, banco `prospecta_t022_producer_test`,
somente com dados e credenciais sintéticos. Foi executado
`pnpm exec vitest run --config vitest.integration.config.ts tests/integration/processed-import-companies.test.ts`.
Verificou os resultados finais permitidos e recusados, correlação, integridade,
datas, ambiguidades, visibilidade, limite de fonte e paginação com SQL real.
O wrapper do cliente executou consultas no schema sintético; a conexão e o
pool de produção não foram exercitados. O container foi removido após os testes.

O UAT usou o launcher sintético em `127.0.0.1:3100`, interceptação de todas as
APIs e bloqueio de destinos externos. Verificou avisos novos com a lista aberta,
ausência de avisos por 202/recibos/resultados históricos, fila, teclado,
deduplicação após navegação, contagens nulas e parada das consultas em 401/403.
Não houve overflow, erro de runtime, conexão externa ou mutação inesperada.
O servidor foi encerrado após o roteiro.

As contagens da seção seguinte pertencem à implementação anterior de
recebimento e permanecem como evidência histórica.

## Verificação histórica da implementação de recebimento

Node 22.19.0 e pnpm 10.34.4. Para os checks gerais, o runner temporário
`/tmp/prospecta-import-notices-check.mjs` executou os comandos pnpm abaixo
com ambiente de `scripts/build-safe.mjs:buildEnvironment()`: configurações
sintéticas, bancos inacessíveis em loopback e integrações desligadas.
Lint/test/contratos/scripts usaram `NODE_ENV=test`; typecheck/build,
`NODE_ENV=production`. O runner está fora do repositório.

| Comando | Resultado |
| --- | --- |
| `pnpm lint` | Aprovado sem warnings na rodada final. |
| `pnpm typecheck` | Aprovado. |
| `pnpm test` | 2.748 testes aprovados em 141 arquivos. |
| `pnpm exec vitest run src/components/imports/import-company-notices.test.tsx` | 22 aprovados; rodada final acrescenta dois casos negativos ao stop do polling. |
| `pnpm test:contract` | 97 aprovados; 57 remotos ignorados sem alvo/credenciais de teste. |
| `pnpm test:scripts` | 16 aprovados. |
| `pnpm build` | Aprovado com configuração sintética. |
| `node tests/browser/manager-import-analysis.mjs` | 290 checks aprovados em 1366, 1440, 375 e 390px. |
| `node --check` nos scripts de browser/deploy e `git diff --check` | Aprovados. |

O browser usou `node tests/browser/run-manager-import-analysis.mjs`, em
`127.0.0.1:3100`, com todas as APIs interceptadas por dados sintéticos e
destinos externos bloqueados. Validou canto/limites visuais, sequência,
fechamento por teclado, persistência após navegação, deduplicação e ausência
de erros de runtime/conexões externas/mutações inesperadas.

Revisão visual adicional em 1366×900 e 375×812: popup totalmente no viewport,
sem overflow; desktop preserva a sidebar. Screenshots exclusivamente
sintéticos, inspecionados em `/tmp/prospecta-import-notices-visual/`, fora do
repositório. No celular, o popup cobre temporariamente parte do cabeçalho e
permite fechamento imediato. O servidor de UAT foi encerrado após os checks.

Integração PostgreSQL: nove testes aprovados em um container PostgreSQL 16
descartável exclusivo, na porta 55432. Comando executado com credenciais
exclusivamente sintéticas:

```bash
PROSPECTA_APP_TEST_DATABASE_URL=postgresql://postgres:synthetic-receipts-019-test@localhost:55432/prospecta_t009_test pnpm exec vitest run --config vitest.integration.config.ts tests/integration/import-received-companies.test.ts
```

Verificou dedup/timestamp original, linha ausente, paginação, isolamento por
organização, FK, rollback transacional em falha de INSERT, negação de
UPDATE/DELETE/TRUNCATE, trigger append-only e preservação no rollback.
Writer/reader executaram SQL real com wrapper de `app-client`, schema de
teste e savepoints. A configuração/conexão/pool do cliente de produção não
foi exercitada. A sequência completa de migrações e SQL de pós-condição e
startupProbe foi executada separadamente no schema nativo sintético.
O container foi removido após a verificação.

## Limitações atuais

A confirmação individual depende de resultado final aprovado, correlacionado
à projeção atual da empresa. Recebimento, início informado, callback ausente,
linha sem resultado ou falha de consulta não confirmam processamento. Resultados
bloqueados, falhos ou desconhecidos ficam fora desta fonte de avisos. Uma
empresa processada pode continuar fora da lista geral por regras próprias de
elegibilidade; o aviso não promete sua presença nessa lista.

A projeção pode mudar quando outro processamento substitui o resultado atual.
Estas leituras não reconstruem uma história imutável e não medem todas as
linhas concluídas do lote. O `total` da fonte individual nunca substitui os
campos de `BatchSummary`. A referência de um lote antigo depende da primeira
leitura completa bem-sucedida; recarregar a aplicação inicia outra sessão visual.
Sem `imports:read`, sem observação de lotes habilitada ou sem correlação aprovada,
não há confirmação de processamento.

Os checks históricos desta etapa de recebimento não acessaram contatos, CSVs
ou dados reais nem acionaram integrações. A publicação histórica autorizada está
documentada separadamente. Os contratos remotos ignorados não demonstram
integração ativa.
