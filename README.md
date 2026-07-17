# Read-only Lead Browser

Read-only business interface for lead qualification data.

## Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Checks

```bash
pnpm lint
pnpm build
```

## Demo 2 — banco de teste em leitura

Demo 2 executa localmente em `127.0.0.1`, com banco de produtor, banco da
aplicação e n8n de teste. Ela habilita importações, observação de lotes e
atividades comerciais para o ator local de teste. Use somente URLs, dados e
CSVs sintéticos de teste; cada envio de CSV chama o n8n de teste.

```bash
cp .env.demo2.example .env.local
# Preencha apenas URLs e credenciais de teste em .env.local.
pnpm demo2
```

Abra [http://127.0.0.1:3011/leads](http://127.0.0.1:3011/leads). Se `pnpm`
não estiver instalado globalmente, execute `npx --yes pnpm@10 demo2`.
O banco da aplicação de teste precisa conter as migrações de `db/app/`, e o
produtor de teste precisa expor as fontes de leitura aprovadas. A Demo 2 exibe
riscos, sinais positivos e evidências aprovadas para o ator local; conteúdo
bruto e relatórios estratégicos continuam indisponíveis.

Para validar o envio, abra `http://127.0.0.1:3011/imports`, selecione
`fixtures/demo2/empresaqui-sintetica.csv` e envie uma única vez. A amostra é
sintética, tem CNPJ estruturalmente válido e usa o marcador de origem `SR_2`,
aceito somente para a linha sintética 2. Ela aciona o n8n de teste pelo app; a
confirmação `202` registra apenas o recebimento pelo workflow, não uma
aceitação durável ou conclusão do lote.

## Local Kubernetes Demo

This is a synthetic, non-production presentation profile. It does not run
migrations, use real credentials, or call the productive n8n workflow.

```bash
npx --yes pnpm@10 demo2:k8s
```

Open [http://192.168.0.20:30097/leads](http://192.168.0.20:30097/leads).
O comando valida o perfil de teste em `.env.local`, cria ou atualiza o Secret
somente no namespace `prospecta-demo`, publica as imagens locais e aguarda o
rollout. As credenciais não são gravadas no manifesto, no Git ou na saída do
comando. O Pod usa um proxy restrito para que as URLs locais de teste
`127.0.0.1:15432` alcancem apenas o serviço PostgreSQL do namespace
`prospecting`. No Secret do Pod, as três conexões são normalizadas para o
loopback local, bancos e roles específicas da Demo 2; as senhas existentes
permanecem somente em memória durante a criação do Secret.

## Demo 3 — Kubernetes local e isolado

A Demo 3 é um perfil sintético separado da Demo 2. Ela usa namespace próprio,
NodePort `30100` no alvo LAN não produtivo `192.168.0.20`, PostgreSQL
app-owned descartável e não chama o produtor ou o n8n. Importações registram
somente a intenção durável e mantêm a aceitação do produtor como não
confirmada.

```bash
cp .env.demo3.example .env.demo3.local
# Preencha o UID exato do namespace kube-system e segredos locais aleatórios.
pnpm demo3:k8s -- --validate
pnpm demo3:k8s -- --preflight
pnpm demo3:k8s
```

Se as imagens já foram publicadas e o rollout foi interrompido pela saúde do
nó, retome sem rebuild com `pnpm demo3:k8s -- --published-images`. O script
revalida cluster, tags e release antes de reaplicar os mesmos objetos.

O preflight exige correspondência exata de contexto, API server, UID do
cluster descartável e marcador de namespace antes de qualquer mutação.

Abra [http://192.168.0.20:30100/leads](http://192.168.0.20:30100/leads).
Falhas de rollout restauram imagens anteriores quando existe uma release
prévia; o script nunca apaga PVC, histórico comercial ou auditoria.
