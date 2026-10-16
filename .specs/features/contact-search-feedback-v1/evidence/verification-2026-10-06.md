# Verificação — motivos da busca

- 7 arquivos / 50 testes focais passaram para formatter, UI, schema,
  serviços e repositórios. Contratos do workflow separado: 35 testes focais
  passaram. A suíte global final confirmou os mesmos módulos.
- PostgreSQL16 sintético descartável: 49 testes em 2 arquivos passaram;
  inclui migração017, campos restritos, idempotência, papéis/organizações,
  grants de função e rollback que preserva diagnósticos existentes.
- Gates globais: lint/typecheck/build-safe, 2.494 testes unitários,
  76 contratos locais e 16 testes de scripts passaram.
- O diagnóstico é opcional, com até quatro fatos únicos provider/stage/code,
  sem texto livre, contatos, credenciais, URLs ou corpo de resposta.
- Falha Lusha malformada não vira lista vazia ou fallback Apollo. Apollo com
  domínio não confirmado não dispara busca de pessoas. Timeout confirmado
  conserva estado desconhecido e não provoca repetição automática.
- A interface não afirma que ambos os provedores foram consultados quando
  esse fato não existe; callbacks anteriores exibem motivo não informado.

Publicação app-only foi solicitada depois de concluir o front; a migração017
é empacotada na release Demo 3 HTTPS. Resultado operacional registrado em
`../../demo3-mvp-readiness-v1/evidence/verification-2026-10-06.md`.
O artefato v2 continua inativo no repositório; o workflow remoto não integra
este deploy. Nenhuma consulta real ou revelação de contato foi realizada.
