# Verificação — MVP comercial direto

Escopo: avaliação comercial da empresa e pipeline compacta, com recursos sob
demanda e preparação de mensagem explícita. Publicação app-only no mesmo alvo
Demo 3 HTTPS30443, após a primeira release de contatos confirmada.

## Regressões focais

- Avaliação: 101 testes/3 arquivos e lint passaram.
- Pipeline/contatos/fases: 87 testes/3 arquivos e lint passaram; 45 da página.
- API de fila: 37 testes passaram. Meta de preparação manual independente do
  flag automático, sem permissões/configuração não habilita o recurso; GET
  permanece privado/read-only e não consulta provedores.
- Lista/recursos não fazem POST; geração exige clique por empresa, guarda
  síncrona evita cliques duplicados, 202 não provoca polling ou retry.
- Recursos montam uma vez: edição e diagnóstico permanecem ao recolher.
- 401 retira dados; 403 usa explicação segura; filtros ativos, paginação,
  fonte indisponível e passos sugeridos mantêm seus significados.

## Gates finais e publicação

Comandos pnpm via `npx --yes pnpm@10.34.4`, como na primeira release:

| Comando | Resultado final |
| --- | --- |
| `pnpm lint` | Passou |
| `pnpm typecheck` | Passou |
| `pnpm test` | 138 arquivos / 2.523 testes passaram |
| `pnpm test:scripts` | 16 testes passaram |
| `pnpm test:contract` | 76 testes locais passaram; 57 testes remotos não executados por falta de alvo de contrato |
| `pnpm build:safe` | Build sanitizado de produção passou |
| `node tests/browser/manager-import-analysis.mjs` | 200 checks em 1366/1440/375/390px passaram; todas as APIs sintéticas/interceptadas, zero externos ou mutações inesperadas |
| Imagens e `git diff --check` | Passaram; runtime/assets presentes e arquivos de ambiente excluídos |

Release final: `demo3-preprod-20261006-sales-mvp-001`. Preflight exato e TLS
passaram sem mutação. Publicação/rollout/postflight em andamento neste registro.

Não houve alteração SQL nesta segunda etapa. Os 49 testes PostgreSQL da
primeira release validam as migrations/grants que o bundle final reutiliza;
não se repete o alvo descartável sem mudança de SQL/repositório. Ele foi
encerrado após os testes. Nenhum alvo produtor recebeu mutação.

Workflows n8n permanecem na versão instalada; respostas anteriores de contatos
podem continuar sem diagnóstico. Nenhum teste real de fornecedor, revelação,
outreach, imagem com valores reais ou exportação foi realizado.
