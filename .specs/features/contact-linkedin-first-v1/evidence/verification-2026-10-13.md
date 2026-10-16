# Verificação local — 2026-10-13

Escopo entregue: `contact-asset-targeting-v1` nos mappers do workflow v2
inativo, cópia de interface, diagnóstico seguro `NO_RELEVANT_MATCHES`,
migration app-owned 018 e seu packaging. A integração com uma nova API de
perfis permanece pendente; People Data Labs foi recomendada, sem contratação,
credencial, consulta real ou ativação.

## Verificações

`pnpm` não estava no PATH; os comandos usaram `npx --yes pnpm@10.34.4`, conforme
o README, com Node 22.19.0.

| Comando | Resultado |
| --- | --- |
| `pnpm lint` | Passou |
| `pnpm typecheck` | Passou |
| `pnpm test` | 139 arquivos, 2.618 testes passaram |
| `pnpm test:contract` | 12 arquivos passaram, 2 condicionais ignorados; 92 testes passaram, 57 ignorados |
| `pnpm test:scripts` | 16 testes passaram |
| `pnpm build:safe` | Build Next.js passou com configuração sintética e integrações desabilitadas |
| `pnpm test:integration` | 11 arquivos, 111 testes passaram no PostgreSQL descartável |
| Smoke do stdin de migration 017/018 | Bootstrap 017, aplicação 018, reaplicação protegida de 017 e preservação do diagnóstico passaram |
| `git diff --check` | Passou |

Os contratos de n8n import que dependem de alvo remoto foram ignorados porque
nenhum alvo de teste remoto foi configurado. Os contratos locais do targeting
e do packaging foram executados.

## Banco sintético e limitações

- Foi criado um PostgreSQL local descartável, com duas bases de teste
  allowlisted: `prospecta_t009_test` e `prospecta_t022_producer_test` em
  `localhost:55432`. Credenciais e registros foram somente sintéticos.
- A primeira preparação com o PostgreSQL do host falhou por ausência de
  `pgcrypto` e configuração incompleta de credenciais/limites de teste.
  A execução seguinte em `postgres:16-alpine` teve dois timeouts de setup e
  uma falha de reset subsequente, associados à latência de WAL no disco local.
- O container descartável recebeu `fsync=off` e `synchronous_commit=off` para
  esta verificação funcional. A repetição completa passou, sem alterar código
  ou ampliar timeouts. Isso não comprova durabilidade após falha do servidor.
- O smoke da guarda de replay usou uma terceira base descartável exclusiva,
  criada e removida pela própria verificação. O teste executou o stdin gerado
  pelo helper real, sem executar `kubectl` ou modificar um cluster.
- O servidor do host foi parado; o container de teste foi removido ao terminar.

## Cobertura da mudança

- Patrimônio/ativo imobilizado precede contabilidade/controladoria/finanças e
  cargos explicitamente ligados a inventário/estoques/ativos físicos.
- Patrimônio pessoal/wealth, cargos genéricos, títulos desconhecidos e títulos
  com conteúdo ativo não preenchem a lista.
- Ordem dentro de cada tier é estável; IDs duplicados não ocupam vagas no
  limite de 10.
- Amostra válida sem cargo alvo não equivale a amostra vazia, não dispara
  Apollo e não expõe telefone geral como fallback.
- Resposta inválida e timeout continuam desconhecidos, sem retry.
- Scores e bônus existentes permanecem independentes da nova ordenação.
- O novo diagnóstico é aceito apenas em contato, preserva isolamento e
  histórico de governança, e não autoriza campos ou canais adicionais.
- Rollback da migration 018 preserva fatos e recusa retirar suporte quando um
  diagnóstico novo já foi gravado.

Não houve consulta real a contatos, mudança em producer, implantação,
ativação/substituição de n8n ou operação em produção. A cobertura brasileira
da API recomendada e a compatibilidade de sua licença/política precisam de
validação independente antes da integração e uso real.
