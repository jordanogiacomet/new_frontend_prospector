# MVP do gestor — tarefas

| Tarefa | Arquivos / responsabilidade | Verificação | Estado |
| --- | --- | --- | --- |
| T1 Entrada e roteiro | `/inicio`, root, login, shell/nav e guia; agente onboarding | Auth/permission/redirect component tests; MI-01–02 | Verificado |
| T2 Importação e lotes | Páginas e testes de imports; agente pipeline | 89 testes: retorno incerto, chave preservada, sem retry, null/completion, hidratação, detalhes recolhidos, GET e resultado visível; MI-03–04/09 | Verificado |
| T3 Revisão das empresas | Filtros/lista/detalhe/histórico leads e testes; principal | 92 testes: atalhos exatos, filtros preservados, orientação, identificação recolhida; MI-05–06/09 | Verificado |
| T4 Qualidade e UAT | Gates completos, script browser sintético e evidência | MI-07/09; lint/types/build, 2.377 testes em 129 arquivos e 132 verificações de navegador; nenhum acesso externo nem mutação real | Verificado |
| T5 Publicação Demo 3 | Preflight, release, smoke autorizado e memória | MI-08; sem valores reais em evidência | Adiado por pedido do usuário: focar implementação, infraestrutura depois |

T1–T3 são independentes, com ownership separado. T4 depende das três;
T5 depende de T4 e credenciais válidas do exato cluster autorizado.

O worktree já tem alterações compartilhadas; nenhum commit automático será
feito para evitar incorporar trabalho anterior do proprietário.

Em 2026-10-06, durante a execução, o usuário pediu explicitamente focar na
implementação e deixar infraestrutura para depois. Nenhuma publicação será
feita nesta entrega. O preflight antes desse pedido passou; isso não é prova
de que o código novo esteja publicado.

Evidência final: `evidence/verification-2026-10-06.md`. MI-01–07 e MI-09
verificados; MI-08 permanece adiado. Nenhum trabalho obrigatório da
implementação deste escopo permanece aberto.
