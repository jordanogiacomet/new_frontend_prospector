# Prospecta: feedback e recuperação
> Tentativas incertas conservam contexto e exigem consulta, sem repetição automática.

Entrada: `src/app/(private)/imports/page.tsx:ImportUploadPage()`.
- Aviso ocultável; arquivo, chave e guard síncrono permanecem na página.
- Resultado reabre o aviso e permanece junto ao formulário.
- `src/components/application/use-pending-page-action.ts:usePendingPageAction()`
  protege links, outros formulários, histórico e beforeunload enquanto há POST.
  Navigation API cobre travessias canceláveis; fallback popstate conserva a
  página; saída entre documentos depende da decisão no aviso nativo.
- Celular: aviso no fluxo para não cobrir controles; desktop: canto inferior.

Contatos: `src/components/contacts/contact-enrichment-action.tsx` e
`src/lib/contact-search-feedback.ts`.
- GET falho preserva cards e canais escolhidos; reveal valida estado e correlação.
- `src/server/contact-enrichment-v2/contact-enrichment-v2-repository.ts:readPreviewRequest()`
  projeta o último ledger de recuperação. Resultado parcial exige canais
  correspondentes ao pedido e status terminal; ausência de canal não diagnostica causa.
- Status incerto bloqueia novo envio; acesso negado bloqueia mutações até GET válido.

Comercial: `src/app/(private)/workspaces/[id]/page.tsx` e
`src/components/commercial/qualification-cadence.tsx`.
- Rascunhos permanecem em conflito/falha. POST incerto de nota/atividade
  exige GET confirmado e decisão explícita antes de preparar novo registro.
- PATCH exige mesmo workspace e avanço de versão antes da confirmação.

Mensagens: `src/components/leads/lead-approach-message.tsx`.
- Preparing/unknown → GET. Edição durante espera permanece; aplicar outra
  mensagem exige clique explícito e limpa confirmação de cópia antiga.
- Retorno ao lead após abandono do POST mantém unknown; não dispara novo POST.
- Cópia tem guard e seleção manual do textarea quando clipboard falha.

Leituras: lotes, custos, histórico e listas têm GET explícito; falha temporária
preserva consulta confirmada com aviso, respeitando as recusas de acesso.

UAT: `tests/browser/manager-import-analysis.mjs` intercepta APIs em loopback,
recusa externos e testa teclado/375–1440px. Dialog beforeunload é recusado
explicitamente, simulando a escolha de permanecer na página.

Verificação: lint, typecheck, 2.599 testes/139 arquivos, 78 contratos locais
e build sanitizado passaram; UAT 204 checks. Contratos remotos: 57 ignorados.
Detalhes/limitações: `docs/prospecta-ux-feedback-verification.md`.

Publicação posterior autorizada: app-only Demo 3 revisão67, configurações e
gateway preservados; `docs/prospecta-ux-feedback-deploy.md`.

Updated: 2026-10-13
