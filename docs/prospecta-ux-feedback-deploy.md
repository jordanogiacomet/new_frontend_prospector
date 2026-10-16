# Publicação do feedback de UX — Demo 3

Data: 13/10/2026. Autorização: pedido posterior do proprietário, “faça o deploy”.
Alvo: pré-produção local existente, namespace `prospecta-demo3`, acesso
[HTTPS30443](https://192.168.0.20:30443/inicio) com gateway autenticado.

Release da aplicação: `demo3-preprod-20261013-ux-feedback-001`.
Deployment: revisão anterior `66`, revisão publicada `67`.
Imagem anterior: `localhost:5000/prospecta/app:demo3-preprod-20261006-sales-mvp-001`.
Imagem publicada: `localhost:5000/prospecta/app:demo3-preprod-20261013-ux-feedback-001`.
Digest publicado e confirmado no pod:
`sha256:bb9a0e8b7f4d47f708356e10c0b9235a90fbf2f63670dc4cf45630a39d8b747f`.

## Escopo publicado

Somente a imagem do container `prospecta` foi substituída. O patch usou
precondições de resourceVersion e imagem anterior. O checksum do template
anterior foi conferido antes da alteração; após o rollout, a única diferença
no template foi a imagem da aplicação.

ConfigMap, Secrets, credenciais do gateway, feature flags, TLS, request-edge,
proxy e StatefulSet PostgreSQL permaneceram com suas referências anteriores.
Não houve migração, escrita no produtor, importação, revelação de contato,
geração de mensagem, chamada de fornecedor ou publicação/ativação de n8n.

Foi usada publicação restrita da aplicação porque o helper completo também
reaplica migrations e cria novas credenciais de gateway. Essa release não
exigiu tais operações. As colunas existentes do ledger e a permissão SELECT
do runtime foram confirmadas por uma consulta somente de metadados.

## Verificações

- `node scripts/deploy-demo3-k8s.mjs --validate`: passou, sem mutação.
- `node scripts/deploy-demo3-k8s.mjs --preflight`: passou com kubeconfig
  dedicado; contexto, API HTTPS, kube-system UID, namespace não produtivo,
  TLS existente, fonte de leitura, registry e tag imutável confirmados.
- `docker build` e `docker push` da imagem: passaram. A imagem contém runtime,
  quatro marcadores de feedback no cliente e dois da projeção no servidor;
  arquivos `.env*` e `.git` estão ausentes.
- Imediatamente antes do patch, identidade do cluster e checksums da aplicação
  e PostgreSQL foram revalidados. Nenhuma configuração operacional foi alterada.
- Rollout: concluído; aplicação `1/1` Ready, três containers prontos com zero
  restarts. PostgreSQL `1/1` Ready com a imagem anterior.
- Postflight HTTPS: 17 checks passaram com a CA existente e credenciais
  conservadas somente em memória. Quatro recusas anônimas `401`, oito páginas
  autenticadas `200`, quatro APIs GET `200` com `private, no-store`, e os
  recursos publicados de importação contendo “Ocultar aviso”/“Reabrir aviso”.
- O digest do container ativo corresponde à imagem publicada.

Não foram gravados valores de empresas/contatos, corpos de respostas reais,
credenciais, screenshots ou dados privados como evidência. Os corpos das APIs
foram descartados; a inspeção do feedback usou apenas código estático servido.

Os gates locais anteriores estão em
[prospecta-ux-feedback-verification.md](prospecta-ux-feedback-verification.md):
lint, typecheck, 2.599 testes, 78 contratos locais, build sanitizado e 204
checks UAT passaram. As 57 verificações de ingress remoto ficaram ignoradas;
o deploy não as transforma em evidência de integração.

## Rollback disponível

A revisão `66` foi capturada antes da mutação. Caso necessário, depois de
revalidar o alvo Demo 3, restaurar com:

```bash
kubectl -n prospecta-demo3 rollout undo deployment/prospecta-demo3 --to-revision=66
kubectl -n prospecta-demo3 rollout status deployment/prospecta-demo3 --timeout=600s
```

Usar o kubeconfig dedicado e confirmar a imagem anterior, referências de
configuração e prontidão após a restauração. O rollback não foi necessário
nesta publicação e não apaga histórico/auditoria nem altera dados produtores.
