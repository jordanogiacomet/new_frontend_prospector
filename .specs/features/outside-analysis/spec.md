# Outside Analysis Specification

**Status:** Approved for Demo 3
**Approved:** 2026-07-23

## Problem Statement

“Leads para análise” mostra apenas empresas elegíveis para a análise pública.
Empresas encaminhadas por uma decisão já registrada pelo CRM ficam fora dessa
lista, embora o produtor preserve a ação e o motivo da decisão. O gestor
precisa consultar essas empresas sem confundi-las com falhas ou descartes.

## Goals

- [ ] Oferecer uma visão paginada das decisões atuais tomadas pelo CRM.
- [ ] Exibir o motivo armazenado sem recalcular ou reinterpretar a decisão.
- [ ] Manter a visão atualizada enquanto a página estiver visível.
- [ ] Preservar autenticação, integridade e escopo de lotes da Demo 3.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Histórico completo de decisões anteriores | O MVP consulta somente a projeção atual íntegra. |
| Falhas, bloqueios ou resultados intermediários | Não são decisões pelo CRM. |
| Alterar decisão, ação ou motivo | O Prospecta permanece somente leitura no produtor. |
| Abrir a análise pública da empresa | Esse resultado não entrou na análise pública. |
| Novos filtros, exportação ou ações em lote | Não são necessários para responder “qual empresa e por quê”. |

## User Stories

### P1: Consultar empresas fora da análise

**User Story:** Como gestor comercial, quero ver as empresas encaminhadas por
uma decisão do CRM e o motivo registrado para entender por que elas não
aparecem em “Leads para análise”.

**Acceptance Criteria:**

1. WHEN uma projeção atual íntegra possui exatamente um terminal
   `CRM_DECIDIU_E_SALVO` com proveniência válida THEN o sistema SHALL
   disponibilizá-la em “Fora da análise”.
2. WHEN o terminal pertence a uma execução de teste THEN o sistema SHALL
   disponibilizá-lo apenas pelas regras normais de produção ou por lote
   correlacionado à organização autenticada no perfil exato da Demo 3.
3. WHEN uma empresa é exibida THEN o sistema SHALL mostrar empresa, CNPJ,
   cidade/UF, setor, ação armazenada, motivo armazenado, data da decisão e lote
   de importação.
4. WHEN ação, motivo ou outro valor aprovado estiver ausente THEN o sistema
   SHALL informar indisponibilidade sem inventar conteúdo.
5. WHEN o usuário alternar entre as visões THEN o sistema SHALL oferecer links
   claros para “Para análise” e “Fora da análise”, com a visão atual
   identificada.

**Independent Test:** Inserir somente dados sintéticos nos bancos descartáveis,
abrir `/leads/outside-analysis` e confirmar que decisões CRM autorizadas
aparecem com o motivo, enquanto resultados públicos e lotes não correlacionados
permanecem ausentes.

### P1: Manter a consulta atual

**User Story:** Como gestor comercial, quero que a lista seja recarregada
automaticamente para ver decisões que terminarem enquanto acompanho a página.

**Acceptance Criteria:**

1. WHEN a página estiver visível THEN o sistema SHALL consultar novamente a
   lista a cada cinco segundos sem sobrepor requisições.
2. WHEN a página estiver oculta THEN o sistema SHALL deixar de iniciar novas
   consultas periódicas.
3. WHEN a página for desmontada THEN o sistema SHALL cancelar a consulta e o
   temporizador ativos.
4. WHEN a consulta falhar, estiver vazia ou apontar para uma página fora do
   intervalo THEN o sistema SHALL mostrar um estado seguro e específico.

**Independent Test:** Controlar temporizadores e visibilidade no teste de
componente e verificar atualização, não sobreposição, pausa e cancelamento.

## Edge Cases

- WHEN o produtor exceder o limite seguro de projeções atuais THEN o sistema
  SHALL falhar fechado com erro de negócio sem detalhes internos.
- WHEN o motivo estiver vazio ou nulo THEN a interface SHALL mostrar “Não
  disponível”.
- WHEN a ação armazenada não possuir rótulo aprovado THEN a interface SHALL
  mostrar “Não mapeado” sem expor o valor bruto.
- WHEN a página solicitada estiver além do total THEN a interface SHALL
  orientar o retorno à primeira página sem declarar que não existem decisões.
- WHEN o usuário não possuir `leads:read` THEN a API SHALL negar acesso antes
  de validar parâmetros ou consultar qualquer banco.

## Requirement Traceability

| Requirement ID | Requirement | Status |
| --- | --- | --- |
| OA-01 | Seleção atual íntegra e exclusiva de `CRM_DECIDIU_E_SALVO` | In Tasks |
| OA-02 | Escopo de produção/Demo 3 por organização e lote correlacionado | In Tasks |
| OA-03 | GET autenticado, paginado e `private, no-store` | In Tasks |
| OA-04 | Abas e campos de negócio com rótulos seguros | In Tasks |
| OA-05 | Polling visível sem sobreposição e com cancelamento | In Tasks |
| OA-06 | Estados de carregamento, vazio, erro e página inválida | In Tasks |

## Success Criteria

- [ ] As decisões CRM sintéticas autorizadas aparecem e os demais resultados
      permanecem ocultos.
- [ ] Nenhum campo proibido, decisão recalculada ou escrita produtora é
      introduzido.
- [ ] Testes direcionados, integração PostgreSQL, lint, tipos, suíte completa,
      contratos e build passam.
- [ ] Uma release imutável é publicada e verificada na Demo 3.
