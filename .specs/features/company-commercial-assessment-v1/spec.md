# Avaliação comercial da empresa

Em 06/10/2026, o proprietário pediu que a tela da empresa esclareça se vale
a pena prospectá-la, com linguagem empresarial de um profissional de vendas,
sem induzir a obter contatos. Solicitou implementar depois do primeiro deploy
de contatos e publicar novamente.

| ID | Critério verificável |
| --- | --- |
| CA-01 | O detalhe da empresa destaca a avaliação comercial antes dos dados complementares, com conclusão, motivo disponível e data da análise. |
| CA-02 | A conclusão é apresentação da ação registrada, sem regra nova: prospectar, validar pontos de atenção, acompanhar, não abordar, revisão humana. |
| CA-03 | Pontuação, prioridade e resultado continuam separados e não substituem a ação. Valor desconhecido/ausente não vira aprovação. |
| CA-04 | A linguagem orienta a revisão de vendas com fatos autorizados; não afirma adequação, demanda, disponibilidade de contatos ou conformidade jurídica sem evidência. |
| CA-05 | Baixa confiança, análise antiga e fundamentos indisponíveis permanecem explícitos. Ausência de riscos não comprova validação. |
| CA-06 | Nenhuma CTA de buscar/revelar contatos integra a avaliação; nenhum contato, mensagem, reprocessamento ou nova consulta externa é disparado. |
| CA-07 | Testes sintéticos relevantes e gates passam; segunda release imutável é publicada no mesmo Demo 3 HTTPS após a primeira confirmada. |

Reusar o detalhe, DTO e motivos existentes. Sem alteração de produtor,
servidor, score, recomendações ou permissões. “Legal de prospectar” significa
interesse comercial no contexto do pedido, não declaração jurídica.

Referências: `src/components/leads/lead-detail-summary.tsx`,
`src/lib/lead-labels.ts`, `.specs/features/demo3-mvp-readiness-v1/`.
