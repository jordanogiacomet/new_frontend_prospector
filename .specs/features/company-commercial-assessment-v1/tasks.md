# Tarefas

| Tarefa | Ownership | Verificação | Estado |
| --- | --- | --- | --- |
| A1 Conclusão e linguagem | commercial_readiness: summary/labels/detail e testes | CA-01–06: cinco ações, unknown/null, dados contraditórios, cautela e ausência de CTA de contatos | Concluído: 101 testes focais e lint passaram |
| A2 Roteiro e navegador | principal: UAT sintético e roteiro gerencial | avaliação presente e navegável, desktop/mobile, sem integrações externas | Concluído: UAT final 200 checks em 4 viewports |
| A3 Gates e publicação | principal: gates, imagens, preflight, rollout/postflight e memória | CA-07: segunda release HTTPS confirmada com registros sem dados reais | Pendente |

Ordem explicitamente solicitada: primeiro publicar front de contatos, depois
implementar A1 e publicar novamente. A investigação prévia foi somente leitura.

O pedido seguinte simplifica a pipeline antes dessa segunda publicação;
release final rastreada em `.specs/features/sales-pipeline-mvp-v1/`.
