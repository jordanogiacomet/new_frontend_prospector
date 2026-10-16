# Publicação dos avisos de empresas processadas — Demo 3

Data: 14/10/2026. A autorização de publicação do proprietário foi mantida
para a correção solicitada: cada aviso confirma uma empresa processada.
Alvo: pré-produção local existente, namespace `prospecta-demo3`, acesso
[Registros de envio](https://192.168.0.20:30443/imports/batches), com gateway
autenticado.

Release: `demo3-preprod-20261014-processing-notices-001`.
Imagem publicada:
`localhost:5000/prospecta/app:demo3-preprod-20261014-processing-notices-001`.
Digest conferido no registry e no container ativo:
`sha256:ee1febe2b68012c4c033623d382eb5fc46fb4e71c734306cfa6560ca536cf8a4`.
Hash da cópia isolada da fonte, conferido no label da imagem:
`5843521653f78fbd07d23218ddd7b68f71b30834abea48c868b48827e0d63ca1`.
Revisão final ativa do Deployment: `73`, aplicação `1/1` Ready, zero restarts.

## Comportamento e escopo

O aviso “Empresa processada” usa exclusivamente o novo complemento
`processedCompaniesPage`, com resultados finais aprovados e correlacionados
à projeção produtora atual. Recebimento do CSV e início informado não geram
essa confirmação. A lista de importações acompanha suas submissões visíveis;
resultados históricos são usados como referência sem disparar novos avisos.

Foi substituída somente a imagem do container `prospecta`. Nenhuma migração
foi aplicada nesta correção. A tabela app-owned de recibos da migração 019 e
a API de leitura de recebimento continuam compatíveis. Nenhum workflow n8n,
grant, dado ou estado produtor foi alterado. A nova consulta usa SELECTs
aprovados, com autenticação, escopo da organização, feature flags, correlação,
visibilidade e limites existentes.

As contagens nulas e as regras de aceite/conclusão do lote permanecem vigentes.
Um resultado individual não estabelece conclusão contratual do lote. Detalhes
e limites da fonte estão em
[prospecta-import-company-notices.md](prospecta-import-company-notices.md).

## Verificação e publicação

- Preflight repetido antes das alterações: contexto esperado, API Kubernetes
  HTTPS, UID de `kube-system`, namespace marcado `non-production`, prontidão,
  gateway e CA. Kubeconfig dedicado:
  `/home/jordanogiacomet/.kube/prospecta-demo3.conf`.
- Gates: lint/typecheck/build aprovados; 2.840 testes gerais em 142 arquivos,
  29 testes finais do provider após o ajuste de paginação, 98 contratos
  aprovados e 57 remotos ignorados sem alvo/credenciais de teste, 38 testes
  PostgreSQL sintéticos e 302 checks de browser nos quatro viewports.
- Fonte isolada com 368 arquivos; aplicação e migrações comparadas com o
  workspace verificado. Tag ausente antes do build e do push. Build final
  aprovado e hash da fonte conferido.
- Inspeção offline da imagem, sem rede e com filesystem somente leitura:
  1.778 arquivos, runtime presente, usuário não privilegiado, ausência de
  `.env*`/`.git` e marcadores corretos de processamento nos assets.
- Digest conferido pelo hash do manifest, header do registry, RepoDigest local,
  config digest e container ativo. O label da fonte corresponde ao snapshot.
- JSON Patch limitado à imagem, com precondições de UID, resourceVersion,
  nome do container e imagem anterior. Configurações, Secrets, credenciais,
  flags, TLS e demais containers preservados; template PostgreSQL idêntico.
- A primeira tentativa, revisão `70` → `71`, não confirmou o postflight.
  A imagem anterior foi restaurada na revisão `72`. Uma verificação posterior
  confirmou prontidão, acesso, template original, configurações e PostgreSQL.
  Não houve nova migração ou alteração da fonte da aplicação.
- O verificador passou a aguardar a retirada dos endpoints anteriores e a
  permitir tentativas limitadas exclusivamente de GETs de verificação. Depois
  de novo preflight, a mesma imagem imutável foi publicada em `72` → `73`.
  O motivo preciso da falha inicial não foi estabelecido; a aplicação não
  precisou de outra alteração para passar na publicação final.
- Postflight final: 22 checks HTTPS aprovados. Oito recusas anônimas `401`,
  oito páginas autenticadas `200`, quatro APIs com `private, no-store`, o
  complemento de empresas processadas e os marcadores nos assets publicados.
  O GET individual também exige autenticação. A fonte e a allowlist de campos
  do novo envelope foram conferidas.
- Uma submissão já correlacionada foi usada somente em memória para conferir
  a leitura real autorizada. Corpos, linhas, valores, identificadores de
  empresas/submissões e credenciais não foram gravados em logs ou evidência.

Nenhum CSV foi enviado nesta publicação, nem foram acionados contatos,
fornecedores, workflow ou administração n8n. O servidor sintético de browser
foi encerrado. A senha vigente não foi rotacionada ou gravada no repositório,
imagem ou evidência. Uma página já aberta deve ser atualizada para carregar
os novos arquivos da interface.

## Rollback

Rollback preparado: repetir o preflight e restaurar somente
`localhost:5000/prospecta/app:demo3-preprod-20261014-import-notices-001`, usando
precondições de UID, resourceVersion, nome e imagem atual. Confirmar rollout,
digest, templates, configurações e acesso. Conservar a migração 019, recibos
e histórico de auditoria; nunca apagar registros ou alterar dados produtores.
