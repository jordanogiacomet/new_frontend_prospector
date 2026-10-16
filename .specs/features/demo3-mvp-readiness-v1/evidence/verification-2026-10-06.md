# Verificação — 06/10/2026

Escopo: base MVP gerencial, contatos com motivo factual e publicação app-only
solicitada no Demo 3 exato `https://192.168.0.20:30443`. Preservado o worktree
compartilhado, sem commit de alterações anteriores ou valores reais.

## Gates locais finais da primeira release

Comandos pnpm executados via `npx --yes pnpm@10.34.4`, pois não há binário
global neste shell. Somente identidades, contatos e dados sintéticos nos testes.

| Comando | Resultado |
| --- | --- |
| `pnpm lint` | Passou |
| `pnpm typecheck` | Passou |
| `pnpm test` | 138 arquivos / 2.494 testes passaram |
| `pnpm test:scripts` | 16 testes passaram; inclui lock de deploy com PID vivo/ESRCH/EPERM/corrida |
| `pnpm test:contract` | 11 arquivos / 76 testes passaram; 57 testes remotos de 2 suítes não executados por falta de alvo de contrato |
| `pnpm build:safe` | Build de produção sanitizado passou; sem banco/provedores |
| `pnpm test:integration tests/integration/app-schema-migration.test.ts src/server/commercial/qualification-cadence-repository.integration.test.ts` | 2 arquivos / 49 testes passaram, PostgreSQL16 novo descartável em loopback |
| `git diff --check` | Passou |

UAT final: 184 checks passaram em 1366/1440/375/390px, sem respostas ou imagens
reais, sem tráfego externo ou mutações inesperadas. Smoke standalone sintético: 31 checks
passaram; processo e porta encerrados após verificação.

PostgreSQL incluiu migration017, constraints de diagnóstico, transação,
escopo organizacional, papéis separados e rollback que recusa apagar fatos.
A falha encontrada em `EXECUTE` da função de CHECK foi corrigida antes da
publicação, com regressão para grants existentes e papel criado depois.

## Publicação

Release publicada: `demo3-preprod-20261006-mvp-feedback-001`.
Preflight inicial de contexto/API HTTPS/UID/namespace/TLS passou sem mutação.
Uma repetição durante a montagem concorrente da imagem expirou no helper TLS,
sem mutação; novo preflight passou imediatamente antes da publicação.
Packaging de PostgreSQL novo e migração antes de substituir app existente
incluem017; postcondição verifica colunas/constraints/função além dos índices.
As quatro imagens imutáveis foram publicadas e o rollout de aplicação e
PostgreSQL concluiu. A migração017 e sua postcondição passaram. A imagem de
runtime contém standalone/assets e não contém `.env.local`/`.env.demo3.local`.

Smoke do deploy: gateway anônimo401 e autenticado200 em HTTP30100 e
HTTPS30443. Postflight adicional: 26 checks passaram, oito páginas, APIs,
amostras de análise/histórico e acompanhamento/atividades/notas/auditoria/
cadência, workloads Ready e zero restarts nos containers dessa release.
CA HTTPS verificada. Respostas reais ficaram somente em memória; nenhum valor
de empresa/contato/nota foi registrado. Zero mutações ou provider calls.
Preservados PVC, auditoria, workflow n8n e dados do produtor.

## Limites

- Workflows n8n não são atualizados/ativados nesta publicação da aplicação.
  O artefato v2 separado/inativo contém o diagnóstico novo; callbacks remotas
  anteriores continuam válidas e mostram “motivo não informado”.
- Nenhum webhook, revelação de contato, Lusha/Apollo/OpenAI ou mutação
  produtora é usado no deploy/postflight. Não afirmar teste real de fornecedor.
- Postflight HTTPS usa CA aprovada e credenciais em memória; registra status
  e metadados, descartando valores reais das respostas.
- Segunda etapa solicitada: avaliação comercial da empresa e segundo deploy,
  rastreados em `.specs/features/company-commercial-assessment-v1/`.
