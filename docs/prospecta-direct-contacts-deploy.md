# Publicação de contatos na ficha da empresa — Demo 3 HTTPS

Data: 16/10/2026. Autorização do proprietário: “fazer deploy”, com alvo
esclarecido como “demo https”.

Alvo: pré-produção local existente, namespace `prospecta-demo3`, acesso
[Demo HTTPS](https://192.168.0.20:30443/leads) com gateway autenticado.

Release: `demo3-preprod-20261016-direct-contacts-001`.
Deployment: revisão `73` → `74`.
Imagem anterior:
`localhost:5000/prospecta/app:demo3-preprod-20261014-processing-notices-001`.
Imagem publicada:
`localhost:5000/prospecta/app:demo3-preprod-20261016-direct-contacts-001`.
Digest conferido no registry e no container ativo:
`sha256:766219a0ab1332dfcf12aeda12740b073b7d9b574a56b43ff05537f01296ecb9`.
Hash da fonte isolada, conferido no label da imagem:
`cd759485c80b9184000603796822842228b0ebac5f72216cbf4a7b0ca07c7fd3`.

## Alteração publicada

A pipeline saiu da navegação, do Início e dos atalhos de análise. Contatos
profissionais agora ficam no detalhe da empresa, logo após a avaliação,
com busca explícita por nome/localização ou domínio e confirmação humana
da empresa localizada. Os canais profissionais continuam com revelação
separada e permissões próprias. Links antigos da pipeline abrem Leads.

Somente a imagem do container `prospecta` foi substituída. Configurações,
Secrets, senha do gateway, flags, TLS, edge/proxy e template PostgreSQL foram
preservados. Não houve migração, alteração de n8n, importação, chamada de
fornecedor ou revelação de contato. Dados e auditoria permanecem preservados.

## Verificação

- Preflight conferiu contexto, API Kubernetes HTTPS, UID de `kube-system`,
  namespace com marker `non-production`, prontidão, gateway e CA. Foi usado
  o kubeconfig dedicado `/home/jordanogiacomet/.kube/prospecta-demo3.conf`.
- Uma primeira checagem de API retornou `503`, antes de qualquer mutação.
  Leituras seguintes e o preflight sequencial passaram. A causa precisa
  dessa resposta inicial não foi estabelecida.
- Fonte isolada com 369 arquivos; conteúdo e hash comparados novamente ao
  workspace verificado antes da publicação. A comparação com o snapshot da
  revisão anterior encontrou somente os ajustes de interface/navegação,
  seus testes e arquivos de tipos/configuração de verificação.
- Tag imutável ausente antes do build e do push. Build da imagem passou.
  Inspeção offline sem rede, com filesystem somente leitura e usuário sem
  privilégios, confirmou runtime, 1.775 arquivos, ausência de `.env*`/`.git`
  e os marcadores de contatos na interface.
- Manifest, header de digest, imagem local e label da fonte conferidos.
  JSON Patch limitado à imagem usou precondições de UID, resourceVersion,
  nome do container e imagem anterior, após repetir o preflight.
- Rollout concluído: aplicação `1/1` Ready, todos os containers prontos,
  zero restarts e digest esperado. A única diferença do template é a imagem
  da aplicação; hashes de configurações/credenciais e template PostgreSQL
  permaneceram idênticos.
- 22 checks HTTPS passaram: oito recusas anônimas `401`, sete páginas
  autenticadas `200`, quatro APIs GET com `private, no-store`, redirecionamento
  da pipeline, navegação sem link antigo e assets de contatos com confirmação
  explícita da empresa. O redirecionamento usa resposta `200` com meta refresh
  validado para `/leads`, conforme o streaming do Next.

Corpos reais das APIs foram descartados. O shell do detalhe foi consultado
com um identificador sintético, sem executar navegador ou chamar a API de
detalhe. Nenhum valor de empresa/contato, credencial ou screenshot real foi
gravado como evidência. A verificação confirma publicação/acesso; não
demonstra uma busca real em fornecedor.

Os gates locais estão em
[prospecta-direct-contacts-verification.md](prospecta-direct-contacts-verification.md):
lint, TypeScript, build, 2.797 testes gerais, 98 contratos e 278 verificações
de navegador com dados sintéticos.

## Rollback

Rollback preparado, sem necessidade de execução. Repetir o preflight e
restaurar somente a imagem anterior da revisão `73`, com precondições de
UID, resourceVersion, nome e imagem atual. Confirmar rollout, digest,
templates, configurações e HTTPS. Preservar banco, recibos e auditoria;
não executar rollback SQL nem alterar dados produtores.
