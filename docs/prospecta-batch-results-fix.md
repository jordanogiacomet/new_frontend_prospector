# Resultados das importações — correção de apresentação

Data: 13/10/2026. Pedido: corrigir a tela que exibia processamento iniciado ou
encerrado, “Atualizações disponíveis” e cinco contagens indisponíveis.

## Causa e comportamento corrigido

O relógio das observações inclui registros legados correlacionados. Esses
registros e os avisos operacionais de início/encerramento não comprovam aceite
durável nem resultados terminais. O mapper preserva corretamente as contagens
`null`; a apresentação tratava qualquer observação como atualização de
resultados e repetia campos indisponíveis sem explicar a confirmação ausente.

Lista e detalhe agora exibem “Resultados ainda não confirmados”, com uma
explicação do início ou encerramento informado, quando todas as contagens
permanecem nulas. Os cinco campos continuam consultáveis em “Contagens
detalhadas”. Indisponibilidade da consulta e informações divergentes recebem
mensagens específicas. Contagens parcialmente confirmadas e zeros explícitos
continuam visíveis.

“Linhas informadas” aparece no resumo quando há esse relato de quantidade,
sempre separado de linhas aceitas e resultados confirmados. Uma observação
correlacionada sem contagens usa “Atualização registrada” e cor neutra. O
detalhe explica que os registros de acompanhamento não confirmam os totais.

Arquivos principais:

- `src/components/imports/batch-results.tsx`
- `src/lib/import-batch-presentation.ts`
- `src/app/(private)/imports/batches/page.tsx` e `page.test.tsx`
- `src/app/(private)/imports/batches/[id]/page.tsx` e `page.test.tsx`
- `tests/browser/manager-import-analysis.mjs`

O contrato da API, o mapper, as consultas produtoras e o ledger não foram
alterados. Nenhuma quantidade foi calculada a partir de callbacks, registros
legados ou ausência de eventos.

## Verificação

Comandos pnpm executados com Node 22.19.0, pnpm 10.34.4 e ambiente sintético
derivado de `scripts/build-safe.mjs:buildEnvironment()`.

| Verificação | Resultado |
| --- | --- |
| `pnpm lint` | Passou |
| `pnpm typecheck` | Passou |
| `pnpm test` | 2.608 testes passaram em 139 arquivos |
| Testes focais de páginas, serviço de leitura e mapper de status | 135 passaram, incluindo preservação do aceite durante indisponibilidade ou divergência |
| `pnpm test:contract` | 78 passaram; 57 casos remotos ignorados |
| Build de produção | `pnpm build --webpack` passou na cópia isolada; `docker build` passou com o `pnpm build` padrão/Turbopack |
| UAT `node tests/browser/manager-import-analysis.mjs` | 208 checks passaram em 1366, 1440, 375 e 390px |
| Reprodução sintética da tabela | 18 checks passaram em 1440 e 375px; teclado, quantidade informada, nulidade, leitura dos detalhes e ausência de overflow |
| `git diff --check` e sintaxe do UAT | Passaram |

As APIs do UAT foram interceptadas com fatos sintéticos. As imagens de revisão
contêm somente esses dados. O launcher foi encerrado antes do build. Não foram
exercitados upload real, contato, fornecedor, IA ou alteração comercial.
Testes PostgreSQL não foram repetidos: a correção mantém queries, DTOs e
esquema. Os casos remotos ignorados não constituem evidência de integração.

## Publicação

Release publicada: `demo3-preprod-20261013-batch-results-001`, somente imagem da
aplicação, em [Importações](https://192.168.0.20:30443/imports/batches).
Namespace: `prospecta-demo3`. Deployment: revisão `67` → `68`.
Digest publicado e confirmado no container:
`sha256:0224cca12b9714ca9b894af5c4a769b0965b8d538fad9587fe804cec2792159e`.

O preflight do helper completo foi interrompido por uma execução ativa no
n8n, sem mutação. Foi utilizado o procedimento restrito à imagem da aplicação:
seu preflight confirmou contexto, API HTTPS, UID kube-system, marker não
produtivo, prontidão e hashes dos templates existentes. Ele não reinicia n8n,
altera TLS, reaplica migrations ou gera novas credenciais de gateway.

O procedimento utiliza imagem imutável, lock de deploy, precondições de
resourceVersion e imagem anterior, comparação do template esperado e
verificação do digest. Configurações e credenciais são comparadas em memória;
os valores não são gravados. O rollback restaura apenas a imagem anterior com
as mesmas precondições e recusa alterar um template modificado por outro
operador.

Verificações da publicação:

- A imagem foi construída a partir da cópia de código que passou pelos gates.
  O label da fonte foi conferido. A inspeção offline confirmou 1.720 arquivos
  sem `.env` ou `.git`, defaults de runtime e os textos corrigidos nos bundles
  da lista e do detalhe, com rede desabilitada e filesystem somente leitura.
- A tag estava ausente antes do push; o digest retornado pelo registro foi
  comparado ao digest local antes do patch. A aplicação ficou `1/1` Ready e
  seus três containers ficaram prontos, com zero restarts.
- Os 15 checks HTTPS passaram: duas recusas anônimas `401`, oito páginas
  autenticadas `200`, quatro APIs GET `200` com `private, no-store` e os
  marcadores corrigidos nos assets publicados. A leitura dos assets normaliza
  escapes Unicode/hex sem executar seu conteúdo.
- Configurações, referências e dados de Secrets, gateway, feature flags,
  request-edge e proxy foram preservados. O template PostgreSQL permaneceu
  idêntico; seu estado `1/1` Ready e revisão consistente foram confirmados por
  metadados, sem queries de banco.
- As respostas reais de APIs foram descartadas; não foram gravados corpos,
  valores de empresas/contatos, credenciais, imagens ou screenshots reais.
  Nenhuma importação, chamada de fornecedor, ativação de n8n ou migração fez
  parte da publicação.

Rollback preparado, sem necessidade de execução: restaurar a imagem anterior
`localhost:5000/prospecta/app:demo3-preprod-20261013-ux-feedback-001`, revisão
`67`, depois de revalidar o alvo e a ausência de alterações concorrentes. O
procedimento preserva dados e histórico de auditoria.
