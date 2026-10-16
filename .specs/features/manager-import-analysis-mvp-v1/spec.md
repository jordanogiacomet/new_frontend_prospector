# MVP do gestor — importar e revisar empresas

**Data:** 2026-10-06  
**Escopo:** solicitado pelo proprietário; refinado durante a execução para
importação e análise das empresas que merecem revisão, por enquanto.

O gestor precisa começar pelo envio de um CSV EmpresaAqui, acompanhar os fatos
disponíveis desse envio e revisar as empresas pela prioridade, recomendação,
confiança, riscos e relatório já produzidos. A implementação conecta os fluxos
existentes sem recalcular qualificação ou inventar conclusão de lotes.

**Ajuste de escopo:** durante a execução, o usuário pediu focar na implementação
e deixar infraestrutura para depois. MI-08 fica adiado; esta entrega não inclui
publicação na Demo 3.

## Requisitos

| ID | Resultado observável |
| --- | --- |
| MI-01 | Entrada privada `/inicio`, marca e login levam a um roteiro com autorização server-side e atalhos visíveis somente por permissão. |
| MI-02 | O roteiro orienta importar, acompanhar e revisar, e permite abrir as prioridades B/C existentes sem atribuir nova nota ou garantia comercial. |
| MI-03 | Resposta ilegível, sucesso não reconhecido, UUID de registro inválido, erro de rede ou 5xx após envio ficam com aceite desconhecido; mantém chave/arquivo na tela aberta e não oferece nova submissão como recuperação. |
| MI-04 | Lotes usam linguagem de negócio, preservam contagens desconhecidas e encerramento explícito, e explicam que a lista de análise inclui empresas elegíveis de todas as importações. |
| MI-05 | A lista oferece atalhos B/C/R e todas as prioridades; conserva CNPJ/UF/tamanho da página aprovados, volta à primeira página e não altera dados. |
| MI-06 | A revisão orienta comparar recomendação, confiança, riscos e relatório; dado ausente continua indisponível e prioridade não vira garantia. |
| MI-07 | Lint, TypeScript, testes, build sanitizado e navegador com dados exclusivamente sintéticos passam; evidência não contém valores reais. |
| MI-08 | Demo 3 recebe release imutável somente após preflight do contexto/API HTTPS/UID/namespace e checks autenticados; impedimentos são registrados honestamente. |
| MI-09 | A experiência orienta um usuário comum: situação e resultados aparecem primeiro, identificação técnica fica recolhida, atualização é explícita, o retorno do envio fica visível também no celular e iniciar outro arquivo exige ação humana após confirmação. |

## Limites

- Preservar pipeline comercial existente; agenda/cadência/fechamento adicional
  ficam para outra entrega, após a redução de escopo feita pelo usuário.
- Nenhuma mudança em produtor, n8n, grants, migrações, integrações ou scores.
- Não fazer envio de CSV real, contato ou chamada de IA na verificação.
- Não criar exportação de dados, reprocessamento ou repetição automática.
- Preservar alterações anteriores do worktree; não capturá-las em commits.

## Design

Reusar a identidade de papel claro, tinta escura e verde discreto, as ações
`ui-action`, as permissões do shell privado e os filtros exatos existentes.
Não acrescentar dependências. O início é um roteiro, sem métricas inventadas;
atalhos de revisão são filtros da lista existente. Uma resposta ambígua de
upload orienta consulta ao histórico em vez de novo envio.
