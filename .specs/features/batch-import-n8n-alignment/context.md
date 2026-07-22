# Alinhamento de Importação em Lotes com n8n — Contexto

**Status:** Aprovado para implementação local em 20/07/2026; gates externos
permanecem
**Método:** TLC Spec-Driven — Discuss

## Resultado pretendido

Alinhar o contrato entre Prospecta, n8n e o banco produtor para que:

- uma submissão continue sendo registrada no banco app-owned antes da chamada
  externa;
- o n8n devolva `202` somente depois de uma aceitação durável do lote e de
  todas as linhas aceitas;
- o Prospecta consiga distinguir submissão, aceitação, processamento,
  fechamento incompleto e conclusão sem inventar fatos;
- perda de resposta ou timeout não provoque reenvio automático;
- o workflow produtivo atual e os dados produtores permaneçam imutáveis
  durante desenvolvimento e validação.

## Decisões já fixadas

Estas decisões vêm das instruções do repositório e da autorização do
proprietário; não dependem de uma nova escolha de produto.

| Tema | Decisão |
| --- | --- |
| Workflow atual | Não editar, desativar, clonar, ativar nem depender de alteração no workflow produtivo atual. |
| Nova integração | Desenvolver um ingress separado e versionado em `integrations/n8n/prospecting-import-v1/`. |
| Transporte local | O alvo LAN explicitamente aprovado pode usar HTTP e zero cabeçalhos de autenticação. Isso não é segurança nem precedente para internet/produção. |
| Bytes | O app encaminha uma vez os mesmos bytes validados e calcula SHA-256 sobre esses bytes. |
| Retry | Não há retry automático, reprocessamento ou chamada administrativa do n8n. |
| Bancos | Prospecta escreve somente no banco app-owned e lê o produtor com papel `SELECT`; somente n8n/produtor pode persistir fatos produtores. |
| Aceitação | `202` não é suficiente por si só. O lote só vira `ACCEPTED` após fato produtor durável e correlacionado. |
| Contagens | Ausência ou indisponibilidade produz `null`, nunca zero confirmado. |
| Conclusão | Exige fechamento explícito e exatamente um terminal aprovado por linha aceita. |
| Dados reais | Podem ser lidos apenas no perfil Demo 3 autorizado; nunca entram em fixtures, logs, imagens ou evidência de release. |

## Decisões de comportamento adotadas neste draft

### Uma aceitação atômica por arquivo

O novo ingress trata o arquivo como uma unidade:

1. valida transporte e estrutura antes de escrever;
2. preserva toda linha de dados sintaticamente aceita, mesmo quando ela falhar
   depois em regra de negócio;
3. registra lote, conjunto de linhas e correlação da submissão em uma única
   transação produtora;
4. rejeita o arquivo inteiro se não conseguir persistir a aceitação completa.

Não há aceitação parcial silenciosa.

### Identidade canônica vem do produtor

O `import_batch_id` temporal atual (`empresaqui_<ISO>`) não atende ao schema
estruturado, que exige `ib_<64 hex>`. O novo contrato usa o identificador
canônico retornado pela função produtora. Replays funcionais do mesmo arquivo
podem convergir para o lote canônico já existente, sem reprocessar linhas
concluídas.

### Resposta compatível, semântica corrigida

O sucesso mantém os cinco campos já consumidos pelo app:

```json
{
  "accepted": true,
  "message": "Lote aceito para processamento.",
  "import_batch_id": "ib_<64-hex>",
  "row_count": 120,
  "source": "EmpresaAqui"
}
```

No endpoint versionado, `row_count` passa a significar linhas duravelmente
aceitas, não itens que apenas chegaram ao nó de resposta.

### Resposta antes do processamento, depois da aceitação

O caminho é sequencial:

```text
validar → aceitar transacionalmente → responder 202 → processar linhas → fechar
```

O `202` não espera enriquecimento, score ou qualificação. Ele espera somente a
aceitação durável. O fechamento é registrado depois e nunca inferido apenas do
fim de uma execução n8n.

### Reconciliação não é retry

Após um `202`, o app confirma a aceitação em uma view produtora somente
leitura. Após timeout, a mesma consulta pode recuperar uma aceitação que já
tenha sido commitada. Essa reconciliação:

- nunca envia o CSV novamente;
- nunca chama n8n;
- nunca altera tabela produtora;
- só promove o registro app-owned quando os identificadores e contagens
  coincidem.

## Pontos que exigem decisão/aprovação antes da execução externa

| ID | Questão | Recomendação deste draft | Bloqueio |
| --- | --- | --- | --- |
| OPEN-01 | URL/path do ingress separado | Identificar um novo endpoint de teste não produtivo; não reutilizar o path atual até cutover aprovado. | Impede teste remoto e ativação. |
| OPEN-02 | Interface para continuar a qualificação | O gate local agora aceita somente o envelope exato `prospecta-producer-worker-v1`; identificar e conectar o worker/subworkflow real que o produz preservando as regras atuais. | O contrato é passável sem bypass, mas o processamento fim a fim continua bloqueado até existir o worker real. |
| OPEN-03 | Disparo de reconciliação tardia | Preferir job interno idempotente; enquanto não houver runner aprovado, executar confirmação síncrona após `202` e manter timeouts como desconhecidos. | Impede recuperação automática tardia, mas não a submissão segura. |
| OPEN-04 | Janela de `NO_UPDATE` | Definir por ambiente com dono operacional e evidência de duração real. | Impede habilitar `NO_UPDATE`. |
| OPEN-05 | Migração produtora | Nomear alvo descartável, dono do banco, credencial, rollback e aprovação. | Impede aplicar função/view/tabela de aceitação. |

## Perfil aprovado para execução no repositório

A autorização para executar este plano aprova as seguintes decisões locais,
reversíveis e sem mutação externa:

- path lógico do novo artefato:
  `prospecta/empresaqui/import/v1`;
- nome lógico da interface bloqueada:
  `Prospecta EmpresaAqui Row Worker v1`;
- reconciliação síncrona somente depois de um `202`; timeouts permanecem
  desconhecidos enquanto OPEN-03 não tiver runner aprovado;
- `NO_UPDATE` permanece desabilitado enquanto OPEN-04 não definir a janela;
- DDL produtor pode ser criado e validado estaticamente no repositório, mas não
  aplicado sem OPEN-05;
- nenhum workflow é importado, publicado ou ativado e nenhuma configuração de
  ambiente/deploy é alterada nesta autorização local.

## Discrição de implementação

- nomes internos de nós do novo workflow;
- layout do canvas;
- divisão entre Code, Aggregate, Split Out e Execute Sub-workflow;
- formato interno do payload JSON enviado à função produtora;
- índices adicionais comprovados por `EXPLAIN`;
- forma de empacotar testes sintéticos, desde que nenhum dado real seja
  persistido no repositório.

## Diferido

- autenticação, HMAC, nonce e replay de segurança para produção;
- rollout ou migração em produção;
- retry automático, reprocessamento manual e force token;
- alteração de scores, recomendações ou semântica de qualificação;
- exportação, CRM, notificações e automações de contato;
- armazenamento de CSV bruto no app, produtor, logs ou histórico do n8n.
