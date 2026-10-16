# Feedback e recuperação de erros — verificação local

Data: 13/10/2026. Escopo: implementação local com dados sintéticos.
As alterações anteriores do workspace foram preservadas. Não houve deploy,
migração, escrita no produtor, alteração de n8n ou ativação de integrações.

Após esta verificação local, o proprietário autorizou a publicação. A execução
e seus resultados estão em [prospecta-ux-feedback-deploy.md](prospecta-ux-feedback-deploy.md).

## Lacunas corrigidas

- Importação: aviso de andamento ocultável e reabrível, foco devolvido ao
  controle correspondente e resultado apresentado mesmo após ocultar. A mesma
  tentativa mantém arquivo, chave e bloqueio síncrono contra envio duplicado.
  Há proteção de saída enquanto o envio pertence à página; não há promessa de
  continuidade após recarga/fechamento. No celular o aviso fica no fluxo para
  preservar o acesso aos controles; no desktop ocupa o canto inferior.
- Retorno do CSV: diferencia recebimento confirmado, registro confirmado com
  recebimento pendente, registro não confirmado, validação, sessão, permissão
  e conflito. Resposta inválida e falha de rede/servidor não habilitam reenvio.
  `202` não significa processamento concluído.
- Contatos: recuperação valida UUID, correlação e status de negócio. Cards e
  canais selecionados permanecem durante GET e falhas. O erro fica na ação,
  com consulta do pedido existente. O DTO projeta apenas estado, ID opaco,
  canais solicitados, datas e correspondência com o resultado do ledger
  app-owned; conclusão/parcial dependem de canais governados correspondentes.
  Ausência de canal não diagnostica fornecedor, saldo ou inexistência de contato.
- Comercial: progresso específico e guards síncronos em criação, salvamento,
  atividade, nota e qualificação. Conflitos preservam os campos editados.
  Respostas incertas bloqueiam repetição; GET e revisão explícita permitem
  decidir o próximo passo. Sucesso exige resposta válida e correlação.
- Mensagens: geração incerta/em preparação é consultada por GET. Edição
  durante a espera permanece até uma decisão explícita de aplicar a mensagem.
  Cópia tem andamento, guard, confirmação e seleção manual em caso de falha.
  Voltar à mesma consulta/lead não deixa controles presos em carregamento.
- Leituras: lotes, custos, listas e histórico oferecem atualização segura por
  GET, preservam a consulta confirmada em falha temporária e distinguem sessão
  e falta de acesso. Polling não anuncia continuamente o mesmo sucesso.

## Arquivos alterados nesta tarefa

Importação e feedback compartilhado:

- `src/app/(private)/imports/page.tsx`
- `src/app/(private)/imports/page.test.tsx`
- `src/components/application/use-pending-page-action.ts`
- `src/lib/action-feedback.ts`
- `src/lib/action-feedback.test.ts`

Contatos e projeção segura:

- `src/components/contacts/contact-enrichment-action.tsx`
- `src/components/contacts/contact-enrichment-action.test.tsx`
- `src/lib/contact-search-feedback.ts`
- `src/lib/contact-search-feedback.test.ts`
- `src/types/contact-enrichment.ts`
- `src/server/contact-enrichment-v2/contact-enrichment-v2-repository.ts`
- `src/server/contact-enrichment-v2/contact-enrichment-v2-repository.test.ts`
- `src/server/contact-enrichment-v2/contact-enrichment-v2-service.ts`
- `src/server/contact-enrichment-v2/contact-enrichment-v2-service.test.ts`
- `tests/contract/contact-recovery-feedback.contract.test.ts`
- `.specs/features/contact-enrichment-v2/contracts/contact-enrichment-v2.md`

Comercial:

- `src/app/(private)/work-queue/page.tsx`
- `src/app/(private)/work-queue/page.test.tsx`
- `src/app/(private)/workspaces/[id]/page.tsx`
- `src/app/(private)/workspaces/[id]/page.test.tsx`
- `src/components/commercial/qualification-cadence.tsx`
- `src/components/commercial/qualification-cadence.test.tsx`

Mensagens e consultas:

- `src/components/leads/lead-approach-message.tsx`
- `src/components/leads/lead-approach-message.test.tsx`
- `src/components/commercial/workspace-approach-message.tsx`
- `src/components/commercial/workspace-approach-message.test.tsx`
- `src/app/(private)/imports/batches/page.tsx`
- `src/app/(private)/imports/batches/page.test.tsx`
- `src/app/(private)/imports/batches/[id]/page.tsx`
- `src/app/(private)/imports/batches/[id]/page.test.tsx`
- `src/app/(private)/costs/page.tsx`
- `src/app/(private)/costs/page.test.tsx`
- `src/components/leads/lead-history.tsx`
- `src/components/leads/lead-history.test.tsx`
- `src/app/(private)/leads/page.tsx`
- `src/app/(private)/leads/outside-analysis/page.tsx`

UAT e registro das decisões:

- `tests/browser/manager-import-analysis.mjs`
- `tests/browser/README.md`
- `.notebook/INDEX.md`
- `.notebook/prospecta-action-feedback.md`
- `.notebook/prospecta-frontend-operations.md`
- `.notebook/prospecta-contact-enrichment-boundary.md`
- `docs/prospecta-ux-feedback-verification.md`

## Verificações

Os comandos pnpm usam ambiente derivado de
`scripts/build-safe.mjs:buildEnvironment()`: configurações conhecidas
substituídas por valores sintéticos, bancos indisponíveis em loopback,
integrações e bypass de produção desabilitados. Para lint/test/contratos,
`NODE_ENV=test`; para typecheck/build, `NODE_ENV=production`. Node 22.19.0 e pnpm
10.34.4; pnpm foi preparado fora do repositório porque não estava no PATH.

| Comando | Resultado |
| --- | --- |
| `pnpm lint` | Passou; ESLint da alteração de tipo na cadência também passou |
| `pnpm typecheck` | Passou |
| `pnpm test` | 2.599 testes passaram em 139 arquivos |
| `pnpm build` | Passou; build de produção com configuração sintética |
| `pnpm test:contract` | 78 passaram, 57 ignorados em 2 suítes de integração remota |
| `node tests/browser/manager-import-analysis.mjs` | 204 checks passaram em 1366, 1440, 375 e 390px, inclusive na rodada final |
| `node --check` nos dois scripts de navegador | Passou |
| `git diff --check` | Passou |

O UAT intercepta todas as APIs e conserva as mutações na memória do navegador.
Cobre bytes/chave, ocultar/reabrir com teclado, foco, tentativa única, resultado
oculto, proteção de saída, estados desconhecidos, GET, 401/403, formulários
comerciais e telas pequenas. Zero conexões externas, mutações inesperadas ou
erros de JavaScript na rodada concluída. A recusa de beforeunload no roteiro
representa a decisão de permanecer quando o histórico cruza documentos.

Durante a verificação foram corrigidos o acesso a ref durante render em
contatos, carregamento preso ao retornar à consulta de custos, proteção de
histórico no navegador e prioridades de estado que ainda ofereciam uma nova
busca após submissão de contatos sem registro confirmado. O typecheck também
exigiu separar os estados idle/saving da cadência em uma união discriminada.

## Limitações preservadas

- Não há continuidade garantida de upload após sair, recarregar ou fechar.
  A confirmação nativa de saída depende do navegador; aceitar a saída pode
  interromper a espera. Foram usados Chromium e viewport móvel simulado.
- Submissão de contatos sem ID confirmado não dispõe de lookup seguro por
  GET. A tela orienta conferir a tentativa com o responsável e bloqueia nova
  chave, sem inventar causa.
- Contatos/IA reais, PostgreSQL persistente e n8n não foram acionados. Contatos
  foram verificados por testes de componente, serviço, repositório e contrato;
  os gates de integração permanecem intactos.
- As 57 verificações remotas de ingress foram ignoradas sem alvo e credenciais
  de teste; não demonstram integração ativa. Nenhuma migration foi necessária.
- Não houve avaliação manual com leitor de tela físico; roles, anúncios,
  teclado e foco foram verificados de forma sintética.
