# Tarefas — base do MVP

| Tarefa | Ownership | Done quando | Estado |
| --- | --- | --- | --- |
| T1 Shell e ajuda | onboarding: error/global-error/not-found/loading, shared application UI, /ajuda, private shell/nav e testes | AF-01–02: fallback seguro, sessão/permissão, demo indicado, sem fetch/mutação de recuperação | Concluído; UAT sintético 184 checks |
| T2 Acesso e arquivo | pipeline: pages/tests imports e leads list/detail | AF-03–04: 401/403, stop polling, nenhum fetch sem permissão, rejeição superficial antes POST e chave preservada | Concluído; 204 testes focais |
| T3 Execução local | runtime: package/README, scripts/libs e testes de scripts | AF-06–08: parser reutilizado sem valores, demo loopback segura, startup standalone/assets e documentação atual | Concluído; 11 testes de scripts e 31 checks standalone |
| T4 Identidade e resposta | principal: root metadata/icon/robots/next.config e verificação | AF-05: identidade local, não indexação e headers observados no navegador | Concluído; UAT sintético 184 checks |
| T5 Gates e UAT | principal com apoio onboarding | AF-09: gates completos, UAT app/scripts sintético, evidência e memória | Concluído; gates finais em demo3-mvp-readiness-v1/evidence/verification-2026-10-06.md |

T1–T4 são independentes e têm arquivos distintos; T5 depende da estabilização
das quatro. Typegen/build/dev não devem concorrer pela pasta `.next`.
O pedido posterior do usuário autoriza publicação da aplicação depois de
concluir o front de contatos. Fechamento/gates/publicação estão rastreados em
`.specs/features/demo3-mvp-readiness-v1/`.
