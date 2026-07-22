# Revisão Estática do Workflow n8n Atual

**Data:** 2026-07-22
**Escopo:** export local ignorado pelo Git; nenhuma importação, execução,
publicação, ativação ou chamada à instância n8n
**SHA-256 do export revisado:**
`26a2c00f30a58de01eae60802d470c6ba4d16d0e6e09e8340453c38aea142c23`

## Controles de revisão

- O export permaneceu em `.local/n8n-review/`, excluído por
  `.git/info/exclude` e fora dos commits.
- A inspeção não imprimiu valores de credenciais. O arquivo contém nove nós
  com referências a credenciais e três callbacks com segredo obtido por
  expressão de ambiente; essas referências não foram copiadas.
- Não há `pinData`. Nenhum payload, CSV ou dado de execução foi incorporado a
  esta evidência.

## Inventário sanitizado

| Fato | Observação |
| --- | --- |
| Estado do export | `active: true`; é o workflow atual, não o ingress v1 inativo |
| Grafo | 98 nós; 85 fontes de conexão |
| Tipos principais | 48 Code, 10 IF, 7 Postgres, 7 HTTP Request, 6 Merge, 5 Wait |
| Entrada/saída | um Webhook e um Respond to Webhook |
| Reuso | zero Execute Sub-workflow e zero Execute Sub-workflow Trigger |
| Persistência | sete nós Postgres, todos no modelo legado observado |
| Callbacks | três HTTP callbacks com retry curto e `continueOnFail: true` |

## Achados

### O `202` atual não depende de aceitação produtora

Os ancestrais do nó de resposta são somente Webhook, Extract From File,
normalização e dois Code nodes. Nenhum Postgres é ancestral da resposta. O
`row_count` é a quantidade de itens normalizados e o identificador é criado
como `empresaqui_<timestamp>` antes de qualquer persistência produtora.

O Webhook declara o binário `arquivo_csv`, enquanto o Extract From File ainda
lê `arquivo_csv0`. A divergência permanece e não deve ser corrigida no
workflow atual.

### Os callbacks v7.4 não são fatos X4

`ACCEPTED_ROW` é enviado depois da resposta e de uma espera fixa. Os três
callbacks possuem retry local e continuam a execução quando a entrega falha.
`BATCH_CLOSED` pode, portanto, ser enviado depois de uma falha de terminal e
representa apenas o fim do loop atual. Nenhum callback grava a aceitação
atômica, `lead_input_rows`, terminal estruturado ou fechamento explícito
usados pelo leitor do Prospecta.

Na revisão inicial, o aplicativo não possuía rota para callbacks. A decisão
posterior T15 criou uma exceção estreita somente para `BATCH_CLOSED`: o evento
é autenticado, correlacionado e guardado no app-owned como relato operacional
do fim do loop. Ele não é fato X4, não resolve atomicidade produtora e não
preenche aceite ou contagens.

### O processamento atual não é um worker reutilizável

O export é um monólito iniciado por Webhook. Não há gatilho de subworkflow nem
entrada que aceite as identidades canônicas do lote. Seus nós Postgres não
referenciam `lead_import_batches`, `lead_input_rows`,
`lead_processing_state`, `lead_processing_events`, `lead_decisions`,
`prospecta_accept_empresaqui_batch_v1` ou
`prospecta_close_empresaqui_batch_v1`.

A normalização atual contém 35 grupos de aliases e também calcula as regras
produtoras de pré-confiança, risco, busca e identidade legada. A normalização
do ingress v1 contém oito grupos e existe apenas para aceitação estrutural.
Ela não pode substituir a normalização produtora sem alterar scores e
semântica.

As identidades também são incompatíveis:

| Atual | Estruturada v1 |
| --- | --- |
| `empresaqui_<timestamp>` | `ib_<64 hex>` |
| `lr_<8 hex FNV>` | `lr_<64 hex SHA-256>` |
| chave `empresaqui:...` | `idem_<64 hex SHA-256>` |
| `sourceHash` versionado com FNV | `source_hash_sha256` de 64 hex |

## Decisão de integração

O export atual é somente uma baseline de comportamento. Não será alterado,
chamado, clonado nem usado como subworkflow. Também não é seguro chamar seu
Webhook a partir do ingress v1: isso reenviaria o upload, recriaria identidades
incompatíveis e voltaria a depender de um `202` não durável.

OPEN-02 exige uma implementação produtora separada e explicitamente aprovada.
O desenho recomendado é:

1. A aceitação v1 continua atômica e anterior ao `202`.
2. O produtor devolve ou expõe somente ao n8n um contexto por linha aceita com
   `import_batch_id`, `source_row`, `input_row_id`, `lead_run_id`,
   `idempotency_key`, `decision_id` e hashes canônicos.
3. Depois da resposta, o ingress entrega cada contexto a um worker v1
   separado. Esse worker recebe o payload aceito e preserva, sem reescrever,
   as regras de normalização, qualificação, cache, CRM, score e recomendação.
4. Um adaptador produtor transacional registra exatamente uma classe terminal:
   decisão estruturada para `MATERIALIZED`, estado `SKIPPED` para `BLOCKED` ou
   estado `FAILED` para falha conhecida. Crash não cria terminal.
5. O worker retorna exatamente o envelope de sete campos já validado pelo
   gate `prospecta-producer-worker-v1`.
6. Somente o conjunto terminal completo alcança
   `prospecta_close_empresaqui_batch_v1`; conjunto incompleto deixa o lote
   aberto.

O adaptador precisa bloquear a linha por identidade, aceitar replay idêntico,
rejeitar classe conflitante e persistir apenas erro allowlisted. A gravação
legada e o terminal estruturado devem ter uma fronteira transacional revisada
para evitar materialização legada sem fato X4 confirmado.

## Alternativas rejeitadas

| Alternativa | Motivo |
| --- | --- |
| Alterar o workflow atual | Proibido pela fronteira permanente do produtor |
| Copiar os 98 nós para o ingress | Clona o workflow, duplica regras e cria drift de semântica |
| Chamar o Webhook atual depois da aceitação | Reenvia bytes e pode duplicar custo/efeito |
| Usar callbacks como aceite/terminal X4 | Não é atômico nem fonte produtora aprovada |
| Tratar `company_validation_runs` como terminal | É observação legada retida, não prova terminal estruturado |
| Remover/bypassar o gate v1 | Permitiria fechamento sem um terminal por linha |

## Sequência local proposta

1. Aprovar a criação do worker produtor separado ou fornecer a identidade de
   um worker existente; isso resolve a decisão de OPEN-02, não o gate remoto.
2. Especificar fixtures sintéticas de equivalência para os caminhos normal,
   cache, CRM, CNPJ inválido e falha conhecida.
3. Versionar o contexto produtor por linha e o adaptador terminal com
   rollback e testes PostgreSQL descartáveis.
4. Versionar o worker inativo, sem IDs nem credenciais, e conectar o ingress
   ao gate somente depois de seus testes de equivalência passarem.
5. Manter testes HTTP remotos skipped até OPEN-01 e OPEN-05 fornecerem alvo,
   identidade, dono e credenciais autorizados.

## Efeito nos bloqueadores

- **OPEN-01:** inalterado; o export atual não é a identidade remota do ingress
  v1 separado.
- **OPEN-02:** refinado; não existe worker reutilizável no export. É necessária
  autorização para uma implementação produtora separada e para sua fronteira
  transacional de terminais.
- **OPEN-03:** inalterado; nenhuma reconciliação tardia foi autorizada.
- **OPEN-04:** inalterado; o export não fornece uma janela operacional
  confiável para `NO_UPDATE`.
- **OPEN-05:** inalterado; nenhum DDL foi aplicado fora de PostgreSQL local
  descartável.

## Adendo T15: encerramento simples sem alterar o workflow

O callback `BATCH_CLOSED` já existente foi aproveitado sem editar o export. O
app agora possui `POST /api/imports/events`, validado por segredo dedicado
antes de ler JSON, e aceita somente o envelope estrito observado. A correlação
usa a organização configurada e uma submissão app-owned já reconhecida. Replay
idêntico retorna sucesso; divergência de horário ou contagem falha fechado.

O evento `WORKFLOW_CLOSED_REPORTED` é append-only e contém somente lote,
horário, contagem esperada e rótulos allowlisted. Lista e detalhe mostram
“Processamento encerrado”, mas `BatchStatus`, aceite durável, terminais, leads,
bloqueios e falhas não são promovidos nem preenchidos.

O empacotamento local da Demo 3 inclui a migração app-owned `007`, o segredo no
Secret imutável da aplicação e uma exceção de gateway somente para a rota
exata; essa configuração não foi aplicada ao cluster. O n8n também não recebeu
URL ou segredo. O export permaneceu ignorado, ativo com 98 nós e com o mesmo
SHA-256 registrado no topo deste documento.
