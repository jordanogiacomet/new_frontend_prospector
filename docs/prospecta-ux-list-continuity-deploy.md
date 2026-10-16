# Publicação da continuidade de UX — Demo 3

Data: 14/10/2026. Autorização do proprietário: “faça o deploy”.
Alvo: pré-produção local existente, namespace `prospecta-demo3`, acesso
[HTTPS com gateway autenticado](https://192.168.0.20:30443/inicio).

Release: `demo3-preprod-20261014-ux-continuity-001`.
Deployment: revisão `68` → `69`.
Imagem anterior: `localhost:5000/prospecta/app:demo3-preprod-20261013-batch-results-001`.
Imagem publicada: `localhost:5000/prospecta/app:demo3-preprod-20261014-ux-continuity-001`.
Digest publicado, conferido no registry e no container ativo:
`sha256:9eb443c88ee88952e1b57e41ff021892844279074613e8332f08eee9870c46a6`.
Hash da cópia de fonte, também conferido no label da imagem:
`e431c4678f83c30bbfd89ff1d69541fdd1f9fe2b115ba68e02286d44c1d6ec53`.

## Escopo

Foi substituída somente a imagem do container `prospecta`. A publicação inclui
os ajustes locais de UX do gestor e a continuação dos filtros e retornos às
listas, verificados antes do pedido de deploy.

O procedimento restrito à aplicação preservou o restante do template,
ConfigMap/Secrets, credenciais do gateway, feature flags, TLS, request-edge,
proxy e StatefulSet PostgreSQL. Não foi usado o deploy completo, que reaplica
migrações e cria material de gateway. Não houve migração, mudança de n8n,
importação, chamada de fornecedor, revelação de contato ou geração de mensagem.

## Verificação

- A validação local do helper passou sem mutação. O preflight restrito confirmou
  contexto, API exata HTTPS, UID de `kube-system`, namespace existente com marker
  `non-production`, prontidão, gateway e CA do alvo. Kubeconfig dedicado usado:
  `/home/jordanogiacomet/.kube/prospecta-demo3.conf`.
- A tag imutável estava ausente antes do build e novamente antes do push.
  `docker build` passou na cópia isolada da fonte validada. A inspeção offline,
  com rede desabilitada e filesystem somente leitura, confirmou 1.777 arquivos,
  runtime, usuário não privilegiado, ausência de `.env*`/`.git` e os novos textos
  de filtros/descarte/consulta vazia nos assets.
- O digest do manifest no registry foi comparado ao hash dos bytes e ao digest
  local; a configuração da imagem e o label da fonte também corresponderam.
- Antes do patch, identidade do cluster, UID/revisão/template da aplicação,
  configuração e template PostgreSQL foram revalidados. O JSON Patch usou
  precondições de UID, resourceVersion, nome do container e imagem anterior.
- Rollout concluído: aplicação `1/1` Ready, todos os containers prontos com zero
  restarts e digest esperado. A única diferença no template foi a imagem da
  aplicação. PostgreSQL `1/1` Ready, revisão estável e template idêntico.
- Os 22 checks HTTPS passaram: oito recusas anônimas `401`, oito páginas
  autenticadas `200`, quatro APIs GET `200` com `private, no-store` e os novos
  marcadores de UX nos assets publicados de empresas e pipeline.

Corpos reais das APIs foram descartados. Credenciais e configuração foram
comparadas somente em memória; nenhum valor de empresa/contato, resposta real,
credencial, screenshot ou imagem de dados reais foi gravado como evidência.

Os gates anteriores estão em
[prospecta-ux-list-continuity.md](prospecta-ux-list-continuity.md): lint,
typecheck, 2.658 testes em 139 arquivos, build sanitizado e 286 verificações
de navegador com dados sintéticos. O postflight do deploy confirma publicação
e acesso; não substitui os testes de interação nem demonstra execução de
integrações externas ou persistência de novas mutações.

## Rollback

Rollback preparado, sem necessidade de execução. A versão anterior é a imagem
`localhost:5000/prospecta/app:demo3-preprod-20261013-batch-results-001`, revisão
`68`. Após repetir o preflight do alvo e confirmar que o template ainda é o
esperado desta publicação, restaurar somente a imagem anterior com
precondições de UID, resourceVersion, nome e imagem atual. Confirmar rollout,
template, configuração, PostgreSQL e acesso HTTPS após a restauração.
O procedimento recusa alterar um template modificado por outro operador e
preserva dados e histórico de auditoria.
