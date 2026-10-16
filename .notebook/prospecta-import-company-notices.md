# Confirmação individual de empresas processadas
> Resultado final aprovado na projeção produtora atual → aviso por linha.

Leitura: `src/app/api/imports/[id]/route.ts:GET()`.
- Query `processedCompaniesPage`/`pageSize`; envelope `BatchSummary` preservado.
- `imports:read` + imports feature + submissão da organização primeiro.
- Só lê produtor com observação de lotes habilitada, lote correlacionado e demo
  desligado; resolve visibilidade pelo ator. Fonte ausente: `available:false`,
  `total:null`, sem leitura de visibilidade/repositório; falha retorna erro seguro.
- `meta.processedCompanies`: linha/data, paginação, total e
  `factSource: producer_current_company_results_v1`; sem nome/CNPJ/payload.

Fonte: `src/server/repositories/imports/processed-import-companies-repository.ts`.
- SELECT da validação atual e último run coincidente em empresa/lote/linha/análise.
- Integridade `OK`, resultados `INSERIDO_VALIDATION`/`CRM_DECIDIU_E_SALVO`,
  identidades sem ambiguidade e filtros/limites das leituras produtoras.
- `processedAt` usa `run_created_at`, a data registrada da análise.
- Projeção mutável: processamento posterior pode substituir o fato atual.
  Não é história completa de linhas nem fonte de aceite/conclusão/contagens do
  lote; resultados bloqueados/falhos/desconhecidos não geram aviso.

UI: `src/components/imports/import-company-notices.tsx`.
- Provider no private layout; upload confirmado usa `includeExisting:true`.
- Lista e detalhe existentes usam `false`, suprimindo resultados históricos na
  primeira leitura completa bem-sucedida. Lista acompanha UUIDs visíveis;
  conjunto estável não reinicia polling, paginação/saída libera assinaturas.
- Referência e dedup submissão/linha ficam no provider durante navegação, mesmo
  após liberar assinatura. Reload inicia outra sessão visual.
- GET sem sobreposição, todas as páginas, até 100 resultados/página a cada 5s,
  somente em `/imports*` e aba visível. Falha/leitura parcial não avança referência.
- Um popup “Empresa processada” por vez, canto superior direito, 6s;
  foco/hover/aba oculta pausam. 401/403 removem fila e observações; 404 encerra
  somente a submissão. Fechamento operacional e total esperado observados podem
  encerrar polling, sem promover status nem substituir contagens nulas.

Compatibilidade histórica:
- Callback autenticado `ACCEPTED_ROW` continua registrando recibos app-owned
  somente com `source_row`, no lock/transação do início e sem nomes/CNPJ/payload.
- `receivedCompaniesPage`/`meta.receivedCompanies` preservados; não alimentam popup.
- Migração 019: append-only, FK somente app-owned, runtime SELECT/INSERT;
  rollback populado recusa apagar. Recibos anteriores não são reconstruídos.
- Publicação anterior do aviso de recebimento: Demo 3 revisão 70,
  `docs/prospecta-import-company-notices-deploy.md`. Evidência histórica mantida;
  a correção usa SELECT e não precisa de nova migração ou mudança produtora.

Verificação atual: lint/typecheck/build aprovados; 2.840 testes gerais em 142
arquivos; 29 focais finais do provider, incluindo três regressões de paginação
acrescentadas à rodada geral; 98 contratos aprovados e 57 remotos ignorados;
38 integrações PostgreSQL sintéticas; 302 checks de UAT nos quatro viewports.
Fonte e limitações em `docs/prospecta-import-company-notices.md`. Os números
históricos de recebimento ali permanecem como evidência da versão anterior.

Publicação da correção: Demo 3 revisão 73, release
`demo3-preprod-20261014-processing-notices-001`, somente imagem app, sem migração.
22 checks HTTPS passaram; configurações/credenciais/PostgreSQL preservados.
Primeira tentativa foi revertida; histórico e rollback em
`docs/prospecta-import-processing-notices-deploy.md`.

Updated: 2026-10-14
