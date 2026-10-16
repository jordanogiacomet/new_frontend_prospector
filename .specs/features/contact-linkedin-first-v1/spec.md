# Contatos — LinkedIn primeiro e áreas relevantes

Data: 2026-10-13.

## Solicitação e estados de entrega

O usuário determinou que a primeira busca de contatos seja uma API de busca de
perfis LinkedIn, com foco em patrimônio e nas áreas em que os serviços da
Apollo Gestão fazem sentido. A busca deve encontrar profissionais pertinentes
à empresa da fila comercial, com seleção humana antes de revelar canais.

Os estados são independentes:

| Entrega | Estado nesta especificação |
| --- | --- |
| Critérios de targeting e ordenação local | Implementados e verificados sinteticamente em 2026-10-13; artefato remoto permanece sem alteração |
| LinkedIn como primeira fonte efetivamente consultada | Pendente: API/provider, contrato e permissões ainda não identificados |
| Ativação, teste real ou substituição do fluxo remoto | Não realizados nem autorizados por esta especificação; dependem dos gates aplicáveis |

Implementar os critérios locais não significa que a primeira chamada externa
já use LinkedIn. O fluxo existente consulta Lusha e pode consultar Apollo nas
condições do contrato v2. Não se deve renomear essas consultas como LinkedIn.

## História P1

Como gestor comercial, quero buscar primeiro profissionais no LinkedIn que
respondam por patrimônio e pelas áreas relacionadas aos serviços da Apollo
Gestão, para escolher um contato pertinente ao trabalho oferecido.

## Requisitos

### LI-01 — identificar a primeira fonte antes de integrá-la

- A primeira fonte deve ser uma API de busca de perfis LinkedIn concretamente
  identificada e aprovada para este uso.
- Registrar fornecedor, produto, documentação oficial, endpoint exato,
  autenticação, permissões, filtros disponíveis, resposta de busca, limites,
  custos, retenção e direitos de uso antes de implementar a chamada.
- Distinguir a API oficial do LinkedIn de uma API de fornecedor externo.
  Ter URLs LinkedIn nos resultados de Lusha ou Apollo não transforma esses
  fornecedores em uma API oficial do LinkedIn.
- Não inventar endpoints, scopes, credenciais, disponibilidade de busca nem
  autorização para armazenar os dados retornados.
- Enquanto essa identificação estiver pendente, a fonte LinkedIn permanece
  indisponível para consulta. Não adicionar uma chamada fictícia nem afirmar
  que houve consulta, resultado vazio ou fallback a partir dessa fonte.
- As permissões abertas documentadas do LinkedIn atendem o membro autenticado;
  elas não constituem autorização de busca geral de pessoas por empresa/cargo.
  Integrações comerciais Sales Navigator exigem parceria SNAP, cuja
  documentação consultada informa que novos parceiros não estão sendo
  aceitos. Eventual contrato já existente precisa ser apresentado e verificado.

### LI-02 — ordenar por pertinência aos serviços

A classificação local deve usar cargos e áreas profissionais explicitamente
pertinentes ao portfólio de patrimônio, ativos e inventários da Apollo Gestão,
preservando a ordem da fonte dentro de cada grupo:

1. **Patrimônio e ativo imobilizado:** gestão patrimonial empresarial, controle
   de ativo imobilizado, inventário patrimonial e responsabilidade por ativos
   fixos. Exemplos: gerente/coordenador de patrimônio, analista patrimonial,
   responsável por ativo imobilizado e fixed asset manager/accountant.
2. **Contabilidade, controladoria e finanças:** profissionais responsáveis
   pelos registros, conciliação, controles e decisões financeiras relacionados
   a esses ativos. Exemplos: contador, gerente contábil, controller, gerente
   financeiro e diretor financeiro/CFO.
3. **Inventário de estoques e operações de ativos:** somente cargos que
   indiquem explicitamente responsabilidade por inventário, controle de
   estoques ou gestão operacional de ativos/equipamentos. Um cargo genérico
   de operações, logística ou administração não basta.

- Patrimônio significa patrimônio empresarial/ativo imobilizado; gestão de
  patrimônio pessoal, investimentos e wealth management não é equivalente.
- Marketing, RH e comercial genéricos não são alvos desta busca.
- Não incluir contatos genéricos somente para completar a lista nem inferir
  pertinência a partir de um cargo desconhecido.
- Resultado ausente para esses critérios significa apenas que a amostra não
  trouxe um profissional pertinente; não comprova ausência de contatos na
  empresa.
- Esses critérios são uma política de seleção/ordenação de contatos. Filtros
  remotos só poderão ser mapeados após o contrato da API escolhida mostrar
  quais cargos/departamentos ela realmente aceita.

### LI-03 — manter a identidade da empresa confirmada

- A consulta deve ser vinculada à empresa já selecionada na fila comercial e
  a uma identidade de empresa confirmada pelo usuário.
- Quando a API usar um identificador empresarial próprio, definir e validar
  a correlação antes da busca. Não assumir que nome semelhante ou URL de
  perfil demonstra correspondência com o CNPJ.
- Preservar a seleção explícita de empresa nos casos ambíguos e os limites
  de minimização e isolamento por organização do v2.

### LI-04 — ausência confirmada e resultado desconhecido são distintos

- Uma resposta de busca estruturalmente válida e vazia pode justificar um
  próximo fornecedor somente se o novo contrato aprovar expressamente esse
  fallback e sua ordem.
- Timeout, aceitação desconhecida, resposta inválida, falta de acesso,
  indisponibilidade ou fonte ainda não configurada não equivalem a resultado
  vazio e nunca acionam fallback automático.
- Não repetir automaticamente uma consulta aceita ou de resultado
  desconhecido. Toda nova tentativa deve obedecer à idempotência e às
  condições de ação explícita aprovadas.
- Esta especificação não altera nem ativa a ordem de chamadas do workflow
  existente. A futura substituição deve ser uma integração versionada,
  revisável e validada em alvo aprovado.

### LI-05 — preservar seleção humana e gates de contato

- Aplicam-se as permissões independentes, allowlists de campos/canais,
  autenticação, isolamento por organização, transparência, HTTPS,
  criptografia, supressão, retenção, direitos e gates de ativação de
  `contact-enrichment-v2`.
- Preview não inicia reveal. E-mail profissional ou telefone empresarial
  só podem ser revelados após o usuário escolher um contato e os canais
  aprovados para aquela fonte.
- Dados LinkedIn só podem ser armazenados ou expostos quando o contrato
  específico permitir o uso e a política v2 for compatível. A documentação
  do Profile API restringe armazenamento de perfis de outros membros;
  esse endpoint não deve ser tratado como substituição direta do provider.
- Não habilitar scraping, API interna não documentada, cookies de sessão,
  exportação em massa, mensagens ou outreach automático.
- Não realizar consultas reais a contatos ou alterações no n8n durante a
  implementação e verificação sintética dos critérios locais.

### LI-06 — não alterar recomendações ou pontuações

- Não alterar `finalScore`, `priority`, `finalAction`, `finalVerdict`,
  `icpScore`, `strategicAssetScore`, `trustStatus` ou outras semânticas do
  produtor.
- Preservar `contact-commercial-score-v1`: a nova pertinência local não
  acrescenta pontos, modifica pesos ou transforma cargos adjacentes em
  perfis qualificados por esse score.
- Mostrar pertinência do contato, etapa comercial e recomendação do produtor
  como fatos distintos.

## Critérios de aceitação

| ID | Quando | Então |
| --- | --- | --- |
| AC1 / LI-01 | A API/provider não foi identificado e aprovado | A integração LinkedIn permanece pendente, sem chamada inventada ou afirmação de consulta |
| AC2 / LI-02 | Uma amostra sintética contém cargos pertinentes dos três grupos | Patrimônio/ativo imobilizado vem primeiro, contabilidade/controladoria/finanças depois e inventário/operações explicitamente relevantes por último |
| AC3 / LI-02 | A amostra contém RH, marketing, comercial, operações genéricas ou wealth management | Esses cargos não são usados para preencher o resultado pertinente |
| AC4 / LI-03 | A identidade da empresa é ambígua | A busca não prossegue sem confirmação e correlação previstas no contrato |
| AC5 / LI-04 | Há timeout, resultado desconhecido ou resposta inválida | O estado permanece honesto, sem retry ou fallback automático |
| AC6 / LI-05 | Existe preview sem seleção humana ou um gate v2 não passa | Nenhum canal é revelado e a operação dependente permanece bloqueada |
| AC7 / LI-06 | Um contato muda de posição pela nova pertinência | Scores, recomendações do produtor e regras de `contact-commercial-score-v1` permanecem iguais |
| AC8 / LI-01–LI-06 | Os critérios locais passam nos testes | O resultado é registrado como targeting local verificado, mantendo a fonte LinkedIn pendente até sua validação independente |

Verificação local usa somente nomes, cargos, empresas e contatos sintéticos.
A validação da integração externa deverá comprovar o endpoint aprovado, o
primeiro fornecedor efetivamente consultado, a correlação da empresa,
respostas vazias/desconhecidas e os gates v2 em um alvo separadamente aprovado.

## Referências oficiais consultadas em 2026-10-13

- [Getting Access to LinkedIn APIs](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access): permissões abertas e exigência de parceria SNAP para integrações comerciais.
- [Sales Navigator Application Platform](https://learn.microsoft.com/en-us/linkedin/sales/): serviços disponibilizados e aviso de indisponibilidade de entrada de novos parceiros.
- [Profile API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api): acesso restrito, consulta de outros membros mediante identificador obtido em APIs limitadas e restrições de armazenamento.

## Políticas existentes preservadas

- `.specs/features/contact-enrichment-v2/spec.md`
- `.specs/features/contact-enrichment-v2/contracts/contact-enrichment-v2.md`
- `.specs/features/contact-commercial-score-v1/spec.md`
- `AGENTS.md`

Esta especificação registra a nova direção e os critérios locais; não muda
contratos remotos, credenciais, ambiente, workflow ou autorização de produção.

## Recomendação solicitada pelo usuário

Em 2026-10-13, o usuário pediu uma recomendação de API. A candidata recomendada
para o MVP é **People Data Labs Person Search**, ainda sem seleção/contratação
ou ativação: é uma API externa de uma base profissional, com URLs LinkedIn,
e não uma consulta em tempo real à API oficial do LinkedIn.

- O contrato permite filtrar empresa atual e cargo, usar `size` para limitar
  perfis e `data_include` para retornar somente campos aprovados, sem canais
  no preview. A correlação da empresa continua exigindo validação.
- O plano divulgado oferece até 100 créditos/mês gratuitos; o Pro começa em
  US$ 98/mês por 350 créditos. Person Search cobra por perfil retornado.
- Cobertura e atualização de cargos patrimoniais brasileiros precisam de um
  piloto controlado; tamanho de base não comprova taxa de acerto.
- O novo provider, sua licença/retenção e eventual operação de canais precisam
  de contrato/política específicos. Não reutilizar IDs PDL como IDs Lusha/Apollo
  nem presumir autorização de reveal ou fallback entre essas fontes.
- Crustdata é uma alternativa se a busca live for indispensável, sujeita à
  confirmação do plano e do custo. Nenhum provider foi consultado com dados
  reais e nenhuma contratação foi iniciada.

Referências da recomendação:

- [PDL Person Search — filtros e projeção](https://docs.peopledatalabs.com/docs/input-parameters-person-search-api)
- [PDL — preços](https://www.peopledatalabs.com/pricing/person)
- [PDL — consumo de créditos](https://support.peopledatalabs.com/hc/en-us/articles/25794271805211-Pricing-credits)
- [Crustdata — People Search](https://docs.crustdata.com/api-reference/person-apis/search-people-using-filters-and-sorting)

## Evidência local

Resultado, comandos, contagens e limitações:
[verification-2026-10-13.md](evidence/verification-2026-10-13.md).
