# Controle de Custos por Run e Lote — Especificação

**Status:** Implementada localmente em 15/07/2026; validação final de build e
gates externos pendentes

## Problema

O banco produtor possui uso de LLM e cálculos de custo por execução, mas o
Prospecta não pode hoje mostrar esses dados. Gestores não conseguem acompanhar
o custo estimado de uma execução nem o acumulado dos lotes que pertencem à sua
organização.

O valor disponível no esquema não é uma fatura: é um custo LLM calculado a
partir de tokens registrados e da tabela de preços efetiva na data do run.
Assim, o produto deve chamá-lo de **custo LLM estimado**, nunca de “valor
efetivamente pago”, até haver conciliação aprovada com faturamento.

## Decisão de escopo e gates

O repositório foi autorizado a alterar a política para esta feature em
15/07/2026. A exceção será mínima: resposta financeira restrita a
`costs:read`, apenas em USD, com custo LLM **estimado** e estado de cobertura.
Tokens, modelos, preços unitários e uso bruto permanecem vedados.

O MVP usará o campo produtor já calculado
`company_validation_runs.llm_estimated_cost_usd`, somente quando ele for
estritamente positivo e o run tiver tokens positivos. Zeros, valores ausentes,
duplicidade de `lead_run_id` e qualquer fonte indisponível permanecem
desconhecidos, não custo zero. Isso evita afirmar como pago ou conhecido algo
que o schema atual não prova.

Para produção, continuam obrigatórios:

1. O operador do produtor conceder ao papel somente leitura exatamente as três
   colunas necessárias (`import_batch_id`, `lead_run_id`,
   `llm_total_tokens`, `llm_estimated_cost_usd`) e validar a concessão em
   destino não produtivo.
2. Registrar evidência de desempenho e aprovação do dono do banco para as duas
   consultas paginadas/agregadas desta feature antes de habilitar a flag em
   produção.
3. Configurar uma lista server-side de sujeitos autorizados e habilitar
   explicitamente a feature no ambiente alvo.

## Fontes verificadas

| Necessidade | Fonte atual aprovada para o MVP | Limitação |
| --- | --- | --- |
| Identidade da execução | `public.company_validation_runs.lead_run_id` | A tabela retém observações; não há unicidade/completude comprovada. |
| Custo por linha | `public.company_validation_runs.llm_estimated_cost_usd` | Default `0` não prova custo conhecido; o MVP o trata como desconhecido. |
| Uso para validar disponibilidade | `public.company_validation_runs.llm_total_tokens` | Default `0` também é desconhecido para o MVP. |
| Agregados legados | `public.company_validation_runs_costed` e `public.company_validation_cost_by_batch` | Não são usados: fazem `COALESCE(..., 0)` e não resolvem escopo/deduplicação. |
| Preço histórico | `public.model_pricing` e `public.llm_cost_usd(...)` | Não é consultado pelo app; DDL estática não é fatura. |
| Escopo Prospecta | submissões app-owned correlacionadas por `import_batch_id` | Não autoriza incluir todo o histórico global do produtor. |

## Objetivos

- [ ] Mostrar, apenas a atores autorizados, o custo LLM estimado de um
      `lead_run_id` quando a fonte aprovada o confirmar.
- [ ] Mostrar o total estimado dos lotes correlacionados à organização do ator.
- [ ] Preservar `indisponível` e `desconhecido`; nunca converter ausência em
      zero.
- [ ] Impedir o vazamento de tokens, modelos, preços unitários, `llm_usage`,
      payloads ou identificadores internos.

## Fora de escopo

| Item | Motivo |
| --- | --- |
| Faturas, créditos, impostos ou conciliação financeira | Não há fonte de faturamento aprovada. |
| Conversão para BRL | Exige taxa, data de câmbio e política financeira não fornecidas. |
| Edição de preços ou custos pelo Prospecta | `model_pricing` e os dados do produtor são imutáveis para a aplicação. |
| Total de todo o produtor | Não há escopo organizacional aprovado para esse agregado. |
| Exposição de tokens, modelos, preços unitários ou uso bruto | Permanecem conteúdo vedado. |
| Reprocessamento/retry para obter custo | É proibido e pode gerar custo duplicado. |

---

## Histórias de usuário

### P1: Custo estimado de uma execução ⭐ MVP

**História:** Como gestor autorizado, quero consultar o custo LLM estimado de
uma execução para acompanhar o gasto de uma análise sem acessar dados técnicos
do produtor.

**Por que P1:** É a menor unidade auditável para entender custo sem confundir
uma estimativa técnica com faturamento.

**Critérios de aceitação:**

1. QUANDO um ator com `costs:read` consultar um `lead_run_id` pertencente a um
   lote correlacionado à sua organização, ENTÃO o sistema DEVE retornar somente
   o valor monetário estimado em USD e seu estado de disponibilidade.
2. QUANDO a fonte aprovada informar uso ou preço desconhecido, ENTÃO o sistema
   DEVE retornar `null` com estado `UNKNOWN`, e não `0`.
3. QUANDO a fonte tiver mais de uma observação para o mesmo `lead_run_id`, ENTÃO
   o sistema DEVE aplicar a regra de deduplicação definida pelo produtor antes
   de mostrar qualquer valor.
4. QUANDO o ator não tiver `costs:read`, ENTÃO o sistema DEVE negar a requisição
   antes de consultar banco ou fonte produtora.
5. QUANDO a resposta for enviada ao navegador, ENTÃO ela NÃO DEVE conter tokens,
   modelos, preços unitários, `llm_usage`, payloads, SQL ou IDs de execução do
   n8n.

**Teste independente:** Com uma fonte sintética aprovada, consultar um run
conhecido, um run com preço ausente e um run fora da organização.

### P1: Total de custo estimado da organização ⭐ MVP

**História:** Como gestor autorizado, quero ver o total de custo LLM estimado
dos lotes correlacionados à minha organização para acompanhar o gasto geral do
Prospecta.

**Por que P1:** “Total geral” só é seguro se o limite organizacional for
explícito; o produtor não oferece esse limite por si só.

**Critérios de aceitação:**

1. QUANDO um ator com `costs:read` abrir o resumo de custos, ENTÃO o sistema
   DEVE agregar apenas lotes correlacionados à organização do ator.
2. QUANDO houver custo desconhecido em qualquer execução elegível, ENTÃO o
   sistema DEVE informar cobertura incompleta; não pode apresentar o total
   parcial como total geral confirmado.
3. QUANDO não houver lotes correlacionados, ENTÃO o sistema DEVE mostrar estado
   vazio, sem inferir gasto zero para o produtor.
4. QUANDO a fonte produtora estiver indisponível, ENTÃO o sistema DEVE mostrar
   estado indisponível, sem inventar um agregado.
5. QUANDO a resposta for entregue, ENTÃO ela DEVE usar `Cache-Control: private,
   no-store` e manter o escopo organizacional server-side.

**Teste independente:** Usar dois conjuntos sintéticos de lotes de organizações
distintas e confirmar que cada ator vê somente seu total e sua cobertura.

### P2: Visão por lote

**História:** Como gestor autorizado, quero comparar o custo LLM estimado dos
lotes da minha organização para identificar onde o gasto se concentra.

**Critérios de aceitação:**

1. QUANDO o resumo listar lotes, ENTÃO o sistema DEVE paginar no servidor e
   exibir apenas identificador de negócio aprovado, custo estimado e estado de
   cobertura.
2. QUANDO um lote não tiver custo confirmado, ENTÃO o sistema DEVE exibir
   `indisponível` ou `desconhecido`, conforme a fonte, sem exibir zero.

**Teste independente:** Criar mais lotes sintéticos que uma página e verificar
paginação, escopo e estados nulos.

## Casos de borda

- QUANDO `lead_run_id` estiver ausente, duplicado ou sem regra produtora de
  deduplicação, ENTÃO o custo DEVE permanecer indisponível.
- QUANDO o preço histórico do modelo não existir, ENTÃO a fonte DEVE sinalizar
  custo desconhecido; a aplicação não pode recalcular com preço atual.
- QUANDO o produtor incluir linhas de teste, ENTÃO a fonte aprovada DEVE definir
  se elas são excluídas; a aplicação não deve adivinhar.
- QUANDO uma submissão não tiver correlação de `import_batch_id`, ENTÃO ela não
  DEVE contribuir para o agregado organizacional.
- QUANDO o valor for zero, ENTÃO a fonte DEVE provar que é zero conhecido; o
  valor default de uma coluna não é prova suficiente.

## Requisitos e rastreabilidade

| ID | Requisito | Fase | Status |
| --- | --- | --- | --- |
| COST-01 | Fonte produtora read-only por `lead_run_id` com semântica nula e deduplicação | Execute | Implementado localmente; gate externo pendente |
| COST-02 | Autorização `costs:read` antes de qualquer trabalho de fonte | Execute | Implementado e testado localmente |
| COST-03 | Custo estimado por run, sem campos técnicos vedados | Execute | Implementado e testado localmente |
| COST-04 | Total somente dos lotes da organização, com cobertura explícita | Execute | Implementado e testado localmente |
| COST-05 | Estados vazio, desconhecido e indisponível sem zeros fabricados | Execute | Implementado e testado localmente |
| COST-06 | Testes sintéticos de autorização, escopo, nulos, duplicidade e não-vazamento | Execute | Implementado e testado localmente |

**Cobertura atual:** 6 de 6 implementados localmente. Produção permanece
bloqueada pelos três gates acima e a validação completa de `pnpm build` ainda
não foi concluída.

## Critérios de sucesso após desbloqueio

- [ ] Um gestor autorizado vê custo LLM estimado por run e total de sua
      organização, com cobertura explícita.
- [ ] A ausência de uso ou preço continua visível como desconhecida, sem zero
      fabricado.
- [ ] Nenhuma resposta, teste, log ou UI expõe tokens, modelos, uso bruto ou
      dados sensíveis vedados.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` passam com dados
      exclusivamente sintéticos.
