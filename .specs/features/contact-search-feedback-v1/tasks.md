# Tarefas — motivos da busca

| Tarefa | Ownership / arquivos | Done quando | Gate | Estado |
| --- | --- | --- | --- | --- |
| C1 Contrato/persistência | contact_search_reasons: DTO, callback schema, serviços/repos, migration017 e regressões | CF-02–03/07: diagnóstico restrito, transação, correlação, antigo compatível, rollback seguro | Vitest + PostgreSQL sintético app-schema | Concluído; 49 testes PostgreSQL na suíte final |
| C2 Explicação no aplicativo | contact_search_reasons: contact-enrichment-action, formatter e testes | CF-01/04/06: motivo factual e desconhecido honesto, nenhum erro bruto | Vitest componentes/formatters | Concluído; 50 testes focais |
| C3 Artefato do fornecedor | provider_workflow_diagnostics: workflow v2 separado, contrato e testes | CF-05–06: diagnósticos por etapa e fallback só após vazio válido | Contratos locais com fixtures | Concluído; 35 contratos focais; artefato inativo |
| C4 Verificação e memória | principal: gates finais, evidência e docs | CF-08: sintético completo, publicação app-only e limite n8n explícito | lint/typecheck/test/scripts/contracts/build/UAT/PostgreSQL | Concluído: migration017 e app publicados, 26 checks HTTPS; n8n preservado |

C1/C2 compartilham responsável. C3 tem artefatos distintos, com enums
coordenados. C4 depende de fonte estabilizada. O pedido posterior autoriza
publicar a aplicação e sua migração no Demo 3 HTTPS após os gates; não inclui
publicar/ativar o artefato separado n8n.
