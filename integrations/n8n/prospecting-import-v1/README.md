# Prospecta EmpresaAqui Import v1

Artefato local e inativo do ingress versionado de importação em lotes. Ele não
é o workflow produtivo atual e não deve ser usado como evidência de um endpoint
remoto.

## Estado

O JSON permanece inativo. Ele implementa localmente validação de transporte,
hash dos bytes, extração CSV, normalização produtora v1, aceitação atômica e
resposta após o commit.

Depois da resposta existe um gate passável para o contrato
`prospecta-producer-worker-v1`. Ele aceita somente um terminal exato por linha,
nas classes `MATERIALIZED`, `BLOCKED` ou `FAILED`, antes do fechamento
explícito. O worker/subworkflow que produzirá esses envelopes ainda precisa ser
identificado e conectado entre a resposta e o gate. Enquanto isso, a ligação
direta recebe o shape da resposta e falha fechado, deixando o lote aberto.

Não publicar, ativar ou substituir o workflow atual. Não configurar uma URL
remota sem alvo não produtivo, dono e aprovação explícitos.

## Importação em ambiente descartável

1. Confirmar que a instância é não produtiva e que o path não conflita com
   outro workflow.
2. Importar `workflow.json` mantendo o workflow inativo.
3. Selecionar a credencial PostgreSQL manualmente no nó
   `Accept Batch Atomically` e, depois de OPEN-02 resolvido, no nó
   `Close Batch Explicitly`. O export não contém credencial.
4. Executar somente fixtures sintéticas depois das funções produtoras
   operator-owned terem sido aplicadas no alvo descartável.
5. Registrar o workflow ID e version ID gerados pelo alvo; não copiá-los de
   outro ambiente.

Não remover o gate para “fazer passar”. Para habilitar processamento terminal,
conectar um worker produtor aprovado que entregue exatamente os sete campos
definidos em `workflow-contract.json`. O gate não altera score, recomendação ou
dados comerciais; ele apenas valida identidades e terminais já persistidos.

O perfil LAN aprovado usa zero cabeçalhos de autenticação. Isso não autoriza
publicação nem torna o endpoint seguro.

## Contrato remoto

O contrato legado usa `N8N_LEGACY_CONTRACT_URL` somente como baseline de
regressão. O contrato v1 usa um alvo separado e HTTPS:

```sh
N8N_VERSIONED_CONTRACT_REQUIRED=true \
N8N_VERSIONED_CONTRACT_URL=<URL_HTTPS_NAO_PRODUTIVA_V1> \
N8N_VERSIONED_CONTRACT_PRODUCER_DATABASE_URL=<URL_POSTGRES_SELECT_ONLY> \
N8N_VERSIONED_CONTRACT_INSPECTION_FILE=<ARQUIVO_DE_INSPECAO_SANITIZADO> \
pnpm test:contract
```

O arquivo de inspeção não substitui a inspeção autorizada. Ele registra e
vincula a identidade remota ao byte exato deste `workflow.json`:

```json
{
  "active": true,
  "artifact_sha256": "<64-hex>",
  "inspected_at": "<ISO-8601>",
  "target_url": "<mesma URL HTTPS do gate>",
  "version_id": "<versionId observado no alvo>",
  "webhook_path": "prospecta/empresaqui/import/v1",
  "workflow_id": "<id observado no alvo>"
}
```

Com `N8N_VERSIONED_CONTRACT_REQUIRED=true`, URL, inspeção ou conexão produtora
ausentes fazem o gate falhar. A conexão PostgreSQL precisa conseguir consultar
somente as duas views allowlisted e não pode ter `INSERT`, `UPDATE` ou
`DELETE` no ledger. O teste lê aceitação, timing, linhas X4, terminais e
fechamento diretamente; não aceita variáveis `...=verified`.

## Rollback

Enquanto o workflow estiver inativo, o rollback consiste em remover somente o
artefato importado do ambiente descartável. Depois de um cutover
separadamente aprovado, o rollback deve desabilitar novas submissões no app e
restaurar a URL/release imutável anterior. Nunca apagar aceitações, linhas,
terminais, auditoria ou dados produtores como parte do rollback.
