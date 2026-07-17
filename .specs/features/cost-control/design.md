# Controle de Custos por Run e Lote — Design

**Spec:** `.specs/features/cost-control/spec.md`
**Status:** Approved for internal implementation

## Arquitetura

O browser chama somente `GET /api/costs`. A rota autoriza `costs:read` antes
de ler a configuração, validar a paginação ou tocar no banco. O serviço obtém
os `import_batch_id` correlacionados à organização no banco app-owned e
consulta somente os quatro campos aprovados no banco produtor. Nenhum dado de
uso, modelo ou preço chega ao DTO.

Não há diagrama: o fluxo segue o padrão já usado de página privada → rota →
serviço/repositório server-only → banco, sem novas integrações.

## Fonte e semântica de custo

Para cada run terminal válido (`integrity_status = 'OK'` e
`processing_result = 'INSERIDO_VALIDATION'`) correlacionado a um lote da
organização:

- `AVAILABLE`: existe exatamente uma linha para o `lead_run_id`,
  `llm_total_tokens > 0` e `llm_estimated_cost_usd > 0`.
- `UNKNOWN`: existe exatamente uma linha, mas uso ou custo é zero/ausente. O
  default do schema torna zero ambíguo; portanto ele não é apresentado.
- `AMBIGUOUS`: há mais de uma linha para o mesmo `lead_run_id`; ela não entra
  na soma.

O agregado soma somente `AVAILABLE`. A cobertura será `COMPLETE` se todos os
runs forem disponíveis, `PARTIAL` se houver conhecidos e desconhecidos ou
ambíguos, `UNKNOWN` se não houver qualquer custo disponível e `EMPTY` quando
não houver runs correlacionados. Assim, uma soma parcial é apresentada como
subtotal estimado, nunca como total geral confirmado.

O valor monetário viaja como texto decimal canônico de até oito casas. Isso
evita conversão numérica pelo driver/JavaScript; o formatter o exibe em
`pt-BR` como `US$` sem arredondar nem perder frações pequenas.

## Reuso

| Elemento | Local | Uso |
| --- | --- | --- |
| Cliente produtor somente leitura | `src/server/db/producer-client.ts` | Consultas parametrizadas e erro seguro. |
| Submissões por organização | `src/server/repositories/imports/import-submissions-repository.ts` | Busca dos lotes correlacionados no banco app-owned. |
| Autorização de rota | `src/server/auth/require-api-session.ts` | `requirePermission('costs:read')` antes de todo outro trabalho. |
| Resposta paginada e segura | `src/server/api/errors.ts` | Envelope e mapeamento para erro indisponível. |
| UI de lista privada | `src/app/(private)/imports/batches/page.tsx` | Estados cliente de carregamento, vazio, indisponível e erro. |
| Formatação | `src/lib/formatters/index.ts` | Novo formatter decimal em convenção brasileira. |

## Componentes

### Política de custo

- **Locais:** `src/server/auth/*`, `src/server/env.ts`, `.env.example`.
- **Propósito:** habilitar explicitamente a feature e conceder `costs:read`
  apenas aos sujeitos server-side de `COSTS_READ_SUBJECTS`.
- **Regra:** lista vazia e flag ausente negam por padrão; o JWT não escolhe a
  permissão.

### Serviço e repositório de custos

- **Locais:** `src/server/costs/cost-read-service.ts` e
  `src/server/repositories/costs/cost-read-repository.ts`.
- **Interfaces:**
  - `listCostOverview({ organizationId, page, pageSize })`
  - `listCorrelatedImportBatchIds({ organizationId })`
  - `listProducerRunCosts({ importBatchIds, page, pageSize })`
- **Dependências:** app client para o primeiro passo e producer client para o
  segundo; as conexões não são combinadas nem recebem escrita.

### API e tela de custos

- **Locais:** `src/app/api/costs/route.ts` e `src/app/(private)/costs/page.tsx`.
- **Contrato GET:** `data` é a página de runs; `meta` contém paginação, moeda,
  cobertura e subtotal/total estimado. A rota só retorna o DTO allowlisted.
- **Estados UI:** carregando, vazio, cobertura parcial/desconhecida,
  indisponível, erro e acesso negado.

## Autorização e fonte allowlisted

| Dado servidor | Fonte | Finalidade | Enviado ao browser |
| --- | --- | --- | --- |
| `import_batch_id` | `prospecting_app.import_submissions` | Delimitar a organização | Não |
| `lead_run_id` | `public.company_validation_runs` | Identificar a execução na lista | Sim |
| `llm_total_tokens` | `public.company_validation_runs` | Decidir disponibilidade | Não |
| `llm_estimated_cost_usd` | `public.company_validation_runs` | Custo LLM estimado | Sim, decimal e somente com `costs:read` |

## Erros e desempenho

| Situação | Comportamento |
| --- | --- |
| Sem sessão/permissão/flag | `401`/`403` antes de DB; `private, no-store`. |
| Banco app/produtor indisponível | `503` seguro; UI de indisponibilidade. |
| Nenhum lote/run | Lista vazia e cobertura `EMPTY`; nenhum zero inferido. |
| Duplicidade/zero | DTO `null` com estado específico; fora da soma. |
| Mais de 100 itens por página | `400` de validação; paginação server-side. |

A habilitação de produção permanece condicionada a `EXPLAIN (ANALYZE,
BUFFERS)` seguro e aprovação dos donos do banco para a consulta por lotes e o
agregado. A feature flag inicia em `false`.
