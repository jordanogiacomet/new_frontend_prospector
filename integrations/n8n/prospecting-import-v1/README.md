# Prospecta EmpresaAqui Import v1

Artefato local e inativo do ingress versionado de importação em lotes. Ele não
é o workflow produtivo atual e não deve ser usado como evidência de um endpoint
remoto.

## Estado

O JSON permanece inativo. Neste estágio ele congela a identidade, o path e a
ordem estrutural `webhook → aceitação → resposta`. A validação completa, o
payload produtor, o processamento por linha e o fechamento são entregas das
tarefas seguintes.

Não publicar, ativar ou substituir o workflow atual. Não configurar uma URL
remota sem alvo não produtivo, dono e aprovação explícitos.

## Importação em ambiente descartável

1. Confirmar que a instância é não produtiva e que o path não conflita com
   outro workflow.
2. Importar `workflow.json` mantendo o workflow inativo.
3. Selecionar a credencial PostgreSQL manualmente no nó
   `Accept Batch Atomically`. O export não contém credencial.
4. Executar somente fixtures sintéticas depois das funções produtoras
   operator-owned terem sido aplicadas no alvo descartável.
5. Registrar o workflow ID e version ID gerados pelo alvo; não copiá-los de
   outro ambiente.

O perfil LAN aprovado usa zero cabeçalhos de autenticação. Isso não autoriza
publicação nem torna o endpoint seguro.

## Rollback

Enquanto o workflow estiver inativo, o rollback consiste em remover somente o
artefato importado do ambiente descartável. Depois de um cutover
separadamente aprovado, o rollback deve desabilitar novas submissões no app e
restaurar a URL/release imutável anterior. Nunca apagar aceitações, linhas,
terminais, auditoria ou dados produtores como parte do rollback.
