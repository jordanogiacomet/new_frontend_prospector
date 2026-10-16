# Contatos na ficha da empresa — verificação local

Data: 16/10/2026.

Solicitação: retirar a pipeline de prospecção e encontrar contatos diretamente
na ficha de cada empresa, conforme a escolha do usuário.

## Comportamento

- Menu, Início, Ajuda e detalhe deixam de encaminhar à pipeline.
- `/work-queue` redireciona para Leads, validando os filtros compatíveis.
- A seção Contatos profissionais fica logo após a avaliação da empresa.
- A busca começa apenas após ação explícita, por nome/localização ou domínio.
  A empresa localizada exige confirmação antes da prévia; a revelação de
  canais continua sendo uma escolha separada.
- São exigidas as permissões `contacts:enrich` e `contacts:read`; revelar e
  governar mantêm suas permissões independentes.
- Atualizar a análise da mesma empresa conserva a solicitação de contatos,
  inclusive quando seu resultado é desconhecido, sem novo envio automático.
- Acompanhamentos existentes, notas, atividades e auditoria são preservados.

## Validação

Comandos executados com a instalação local do pnpm 10.34.4, pois `pnpm` não
está no PATH deste terminal.

| Comando | Resultado |
| --- | --- |
| `pnpm lint` | Passou |
| `pnpm typecheck` | Passou |
| `pnpm test --reporter=dot` | 142 arquivos; 2.797 testes passaram |
| `pnpm build` com `buildEnvironment()` de `scripts/build-safe.mjs` | Passou; configuração sintética e integrações desabilitadas |
| `pnpm test:contract --reporter=dot` | 13 arquivos; 98 testes passaram; 57 testes remotos ignorados |
| `node tests/browser/manager-import-analysis.mjs` | 278 verificações passaram em 1366, 1440, 375 e 390 px |
| `node --check tests/browser/manager-import-analysis.mjs` e launcher | Passou |
| `git diff --check` | Passou |

Os testes de contrato remoto foram intencionalmente executados sem URLs de
alvos externos. Integração PostgreSQL não foi executada: esta alteração não
modifica consultas, repositórios, contratos de dados ou migrações.

## Limites

Alteração local de interface e navegação. Nenhuma migração, publicação,
ativação de integração, consulta de contato real ou alteração de produtor.
O detalhe usa domínio manual ou busca pelo nome; não adiciona o domínio
do produtor ao contrato de detalhe. Flags, HTTPS, transparência e demais
controles de contatos permanecem obrigatórios.

O UAT intercepta APIs com dados sintéticos em loopback. Não comprova
persistência real, execução de n8n ou disponibilidade de provedores.
O cenário de navegador mantém a negação de contatos do ator sintético;
o fluxo autorizado, a confirmação, a revelação e os resultados desconhecidos
são cobertos pelos testes de componentes. O servidor temporário de UAT foi
encerrado ao final.

Publicação posterior, autorizada separadamente pelo proprietário:
[Demo 3 HTTPS em 16/10/2026](prospecta-direct-contacts-deploy.md).
