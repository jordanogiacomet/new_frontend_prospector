# Motivos da busca de contatos

Data: 06/10/2026. Durante a preparação do MVP, o proprietário pediu saber o
motivo quando Lusha ou Apollo não funcionam ou não encontram contatos.

| ID | Comportamento verificável |
| --- | --- |
| CF-01 | A tela informa o resultado confirmado por fornecedor e etapa; busca vazia, acesso recusado, limite de consultas, resposta inválida, erro do fornecedor e resultado desconhecido são distintos. |
| CF-02 | A callback aceita somente diagnósticos opcionais com provider/stage/code allowlisted. Nenhum corpo de erro, URL, credencial, contato ou texto livre integra o diagnóstico. |
| CF-03 | O diagnóstico é persistido na mesma transação do resultado e participa da correlação/idempotência. Dados permanecem organization-scoped no banco app-owned. |
| CF-04 | Callback antiga/ausência de diagnóstico mostra motivo não informado. Nunca afirmar que Apollo foi consultado quando esse fato não existe; resultado vazio não comprova inexistência de contatos profissionais. |
| CF-05 | Fallback Apollo exige amostra Lusha estruturalmente válida e vazia. Resposta malformada, empresa/correlação incompatível ou acesso recusado não disparam fallback. |
| CF-06 | Timeout confirmado de transporte pode ser explicado, preservando status desconhecido e nenhuma repetição automática. 401/403 indicam somente acesso recusado; 429 limite, sem inferir falta de créditos. |
| CF-07 | Migração aditiva revisada tem diagnóstico restrito/nullable e rollback que preserva fatos já registrados. Testes usam somente fixtures e PostgreSQL novo descartável em loopback. |
| CF-08 | Regressões de UI/contrato/repositório e gates locais passam; após concluir o front, publicar a aplicação com migração017 no Demo 3 HTTPS exato, conforme pedido posterior. |

## Desenho

- Reusar callbacks v2 autenticadas e policy/permission gates existentes.
- Campo opcional `search_diagnostics` no transporte; `searchDiagnostics` no
  DTO, com fallback honesto quando ausente.
- Taxonomia versionada sem dados pessoais: provider `LUSHA`/`APOLLO`, stage
  `COMPANY_SEARCH`/`CONTACT_PREVIEW`/`COMPANY_MATCH`, códigos allowlisted.
- Ledger app-owned com coluna nullable restrita via migração `017`. Nenhuma
  mutação em produtor, workflow produtivo ou infraestrutura externa.
- Atualizar somente o artefato separado/inativo de contatos v2. Nenhuma chamada
  real ou publicação para tentar descobrir erros.
- A revelação de canais continua humana; motivos não autorizam PII adicional,
  outreach, nova tentativa, fallback em falha ou relaxamento de HTTPS.
- A integração instalada pode continuar retornando motivos não informados até
  que seu workflow separado seja atualizado sob autorização própria. Publicar
  a aplicação não significa publicar esse artefato n8n.

Referências: `AGENTS.md`, `.specs/features/contact-enrichment-v2/`,
`.specs/features/contact-provider-fallback-v1/` e
`.notebook/prospecta-contact-enrichment-boundary.md`.
