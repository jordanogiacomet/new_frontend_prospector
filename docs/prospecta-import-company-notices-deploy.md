# Publicação dos avisos de empresas recebidas — Demo 3

Data: 14/10/2026. Autorização do proprietário: “faça o deploy e me passe senha”.
Alvo: pré-produção local existente, namespace `prospecta-demo3`, acesso
[Importar CSV](https://192.168.0.20:30443/imports) com gateway autenticado.

Release: `demo3-preprod-20261014-import-notices-001`.
Deployment: revisão `69` → `70`.
Imagem anterior: `localhost:5000/prospecta/app:demo3-preprod-20261014-ux-continuity-001`.
Imagem publicada: `localhost:5000/prospecta/app:demo3-preprod-20261014-import-notices-001`.
Digest conferido no registry e no container ativo:
`sha256:a0dbe7c69484b2a4c4607b2498d10a90fe6723da044072397838d77a9033cada`.
Hash da cópia isolada de fonte, conferido no label da imagem:
`0d8cc50f4fcebcb88afaedbb1e2b34585460f2bb9717d540b913a8e302161a1f`.

## Alteração e migração

Foi aplicada somente a migração app-owned
`019_import_received_companies_forward.sql` e substituída a imagem do
container `prospecta`. Configurações, Secrets, credenciais do gateway, feature
flags, TLS, request-edge, proxy, PVC e template do StatefulSet PostgreSQL
foram preservados. Nenhum workflow n8n ou dado/papel produtor foi alterado.

A migração foi executada pelo owner `prospecta_demo3_owner`, exclusivamente no
banco isolado `prospecta_demo3`, após verificar o alvo. O comando leu o SQL
do snapshot validado por stdin com `kubectl exec --stdin` e
`psql -X --single-transaction --file=- --set=ON_ERROR_STOP=1`.
Foram usados lock timeout de 5s e statement timeout de 20s. Precondições de
database/owner/dependências e pós-condições foram incluídas na mesma transação.

Pós-condições aprovadas: quatro colunas NOT NULL com tipos exatos, PK e CHECKs
validados com definições verificadas, FK composta para a submissão app-owned
com RESTRICT, trigger BEFORE ROW UPDATE/DELETE ativo com a função append-only,
runtime SELECT/INSERT e negação de UPDATE, UPDATE por coluna, DELETE e
TRUNCATE, além de ausência de grants PUBLIC. Não foram lidas linhas do banco
para validar a migração.

Foi corrigido também o comando de futuras migrações do script do repositório
para fornecer `--file=-` ao `psql`, acompanhado de contrato que exige stdin,
transação, arquivo e `ON_ERROR_STOP` na mesma invocation. ESLint, sintaxe e
12 contratos focais em dois arquivos passaram. O deploy completo não foi
executado; as migrações históricas não foram reaplicadas.

## Verificação

- Preflight repetido antes das mutações: contexto e API HTTPS configurados,
  UID de `kube-system`, namespace existente com marker `non-production`,
  prontidão, gateway e CA. Kubeconfig dedicado:
  `/home/jordanogiacomet/.kube/prospecta-demo3.conf`.
- Baseline da revisão 69 registrado: UID, imagem, template da aplicação,
  template PostgreSQL e hash de configurações/credenciais. Nenhum segredo ou
  resposta de negócio foi gravado nesses registros.
- Tag imutável ausente antes do build e do push. Build na cópia isolada da
  fonte validada passou. Inspeção offline, sem rede e com filesystem somente
  leitura, confirmou 1.778 arquivos, runtime, usuário não privilegiado,
  ausência de `.env*`/`.git` e marcadores dos novos avisos nos assets.
- Digest do manifest conferido pelo hash dos bytes, header do registry,
  RepoDigest local e digest ativo; label da fonte conferido.
- A migração 019 passou em transação antes da atualização da imagem. Templates
  e configurações permaneceram idênticos após a migração.
- JSON Patch da aplicação usou precondições de UID, resourceVersion, nome do
  container e imagem anterior. Rollout concluído: aplicação `1/1` Ready,
  todos os containers prontos, zero restarts e digest esperado. A única
  diferença no template foi a imagem da aplicação. PostgreSQL permaneceu
  pronto com template idêntico.
- 22 checks HTTPS passaram: oito recusas anônimas `401`, oito páginas
  autenticadas `200`, quatro APIs GET com `private, no-store`, leitura do novo
  envelope de recibos e os marcadores nos assets publicados.
- A identidade de uma submissão existente foi usada somente em memória para
  conferir correlação e campo allowlist do GET. Corpos, valores, identificadores
  de empresas/submissões e credenciais foram descartados, sem logs/evidência.
- A senha vigente foi recuperada do Secret efetivamente montado pelo gateway
  para responder ao pedido do proprietário; não foi rotacionada nem gravada
  no repositório, imagem ou evidência de release.

Os gates locais e a verificação com 290 checks de browser sintético estão em
[prospecta-import-company-notices.md](prospecta-import-company-notices.md).
O postflight confirma publicação/acesso; nenhuma importação CSV, chamada de
fornecedor, geração/revelação de contato ou nova execução n8n foi acionada.

## Rollback

Rollback preparado, sem necessidade de execução. Repetir o preflight e
restaurar somente a imagem anterior com precondições de UID, resourceVersion,
nome e imagem atual; confirmar rollout, templates, configurações e acesso.
A tabela 019 e seus recibos são conservados: a versão anterior é compatível
com a tabela adicional. Não executar rollback SQL destrutivo, remover
recibos, apagar histórico de auditoria ou alterar dados produtores.
