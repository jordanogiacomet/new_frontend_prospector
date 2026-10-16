# Verificação — MVP de importação e análise

Data: 2026-10-06. Escopo confirmado pelo proprietário: importar CSV e revisar
as empresas, com uso simples por um gestor. Infraestrutura/publicação foram
explicitamente adiadas durante a execução.

## Resultado implementado

- Entrada privada `/inicio` com roteiro de importar, acompanhar e revisar;
  ações independentes por permissão, sem consultas ou métricas na entrada.
- Importação bloqueada até a hidratação, um envio explícito por tentativa e
  retorno visível no celular. Outro arquivo exige seleção e envio humanos.
- Resposta irreconhecível, UUID inválido, erro de rede ou 5xx permanecem
  desconhecidos. Arquivo/chave ficam na tela aberta, sem recuperação por novo
  POST. Isso não promete persistência do arquivo após recarregar.
- Situação e resultados dos lotes em linguagem de negócio; referências
  recolhidas em detalhes, consultas GET recuperáveis e aviso sobre dados da
  última consulta. 401/403 removem os dados anteriores.
- Atalhos B/C/R/todas conservam os filtros aprovados e reiniciam a paginação.
  Pontuação continua um inteiro de 0 a 100; recomendações, riscos e confiança
  continuam fatos existentes, sem nova qualificação.
- O CTA dos lotes abre a lista geral de análises de diferentes importações.
  Não há filtro por lote nem promessa de inventário completo.

## Checks

`pnpm` não está no PATH desta sessão; os gates usam `npx --yes pnpm@10`.

| Comando / verificação | Resultado |
| --- | --- |
| `npx --yes pnpm@10 lint` | Passou na versão final do código. |
| `npx --yes pnpm@10 typecheck` | Passou: typegen e TypeScript estrito. |
| `npx --yes pnpm@10 test` | Passou: 2.377 testes em 129 arquivos, 235,40 segundos, com a correção final de celular. |
| `node /tmp/prospecta-browser-verify/run-build.mjs` | Passou; wrapper executa `npx --yes pnpm@10 build` com ambiente sintético sanitizado. Next 16.2.9, `/inicio` dinâmica. |
| Entrada/login/shell/root | 31 testes em 4 arquivos passaram. |
| Importação e lotes | 89 testes: 35 upload + 54 list/detail passaram. |
| Filtros/lista/tabela/resumo/detalhe/histórico | 92 testes em 6 arquivos passaram. |
| `node --check tests/browser/run-manager-import-analysis.mjs` e `node --check tests/browser/manager-import-analysis.mjs` | Passaram. |
| `git diff --check` | Passou. |

O build usa somente placeholders e URLs de banco indisponíveis em loopback.
Todas as configurações conhecidas em `src/server/env.ts` são sobrescritas no
processo; features, Demo 2, Demo 3 e bypass de autenticação ficam desabilitados.
O `.env.local` não é impresso nem alterado.

## UAT sintético de navegador

Reprodução em `tests/browser/README.md`:

```bash
node tests/browser/run-manager-import-analysis.mjs
PROSPECTA_BROWSER_SYNTHETIC_SCREENSHOTS=/tmp/prospecta-manager-uat node tests/browser/manager-import-analysis.mjs
```

O primeiro comando fica em um terminal separado e foi encerrado depois do
roteiro. A porta local 3100 foi liberada antes de typecheck/build.

**132 verificações passaram**, em 1366×900, 1440×1000, 375×812 e 390×844.

- Cinco envios humanos mockados por largura: dois recebimentos confirmados,
  um resultado conhecido como desconhecido, um 202 irreconhecível e um 503.
- Vinte POSTs interceptados ao todo, cada um com chave UUID única e conteúdo
  CSV exatamente igual no único campo multipart esperado.
- Confirmação e resultados desconhecidos visíveis após a resposta sem scroll
  feito pelo roteiro. O CTA confirmado também ficou dentro da área visível
  nas duas larguras de celular.
- Nenhum reenvio automático, chamada externa, mutação inesperada ou erro de
  JavaScript; todas as APIs interceptadas com fixtures sintéticas.
- Contagens não observadas permanecem indisponíveis; encerramento informado
  não vira conclusão comprovada. Identificadores ficam recolhidos por padrão.
- Recuperação de lista/lote após GET 503 usa apenas GET e preserva a última
  consulta com aviso. Filtros B/C e retorno da análise preservam UF/prioridade.
- Sem overflow horizontal nas páginas verificadas. Cinco bases inseguras do
  roteiro foram rejeitadas antes de carregar Playwright.

As três capturas de revisão visual usam somente dados sintéticos e ficam fora
do repositório em `/tmp/prospecta-manager-uat/`. Nenhum dado real foi usado como
fixture, log, captura ou evidência.

## Rastreabilidade

| Requisito | Evidência |
| --- | --- |
| MI-01 | Tests de `/inicio`, root, login e shell: sessão ausente/expirada, organização não autorizada, permissões independentes e redirecionamentos. |
| MI-02 | Links B/C existentes e orientação sem garantia; UAT entrada → importação → revisão. |
| MI-03 | Tests de upload para 200/201/202/204 não reconhecidos, UUID inválido, acknowledgement em array, JSON inválido, rede e 500/502/503/504; UAT 202/503 sem reenvio. |
| MI-04 | Tests null/zero, encerramento explícito, sem fatos correlacionados e CTA geral; UAT lote com contagens ausentes e encerramento informado. |
| MI-05 | Tests dos atalhos exatos com CNPJ/UF/pageSize e remoção de parâmetros não aprovados; UAT B/C e retorno com filtros. |
| MI-06 | Tests do resumo/lista/detalhe/histórico, indisponibilidade e orientação; UAT recomendação por prioridade e referências recolhidas. |
| MI-07 | Lint, typecheck, suíte completa, build sanitizado e 132 verificações de navegador passaram. |
| MI-08 | Adiado pelo proprietário. Código novo não publicado na Demo 3. |
| MI-09 | Tests de hidratação, novo arquivo explícito, detalhes, GET, posição/scroll do resultado; UAT real de viewport e revisão visual sintética. |

## Limites da verificação

Não houve mudança de API, SQL, DTO produtor, migração, grant, contrato externo
ou regra de qualificação nesta entrega. Por isso não foram repetidos os suites
de PostgreSQL e contratos remotos; não foi feito envio de CSV real nem chamada
de n8n, contatos ou IA. O UAT valida o aplicativo com APIs sintéticas; não
prova disponibilidade ou conclusão da pipeline externa na Demo 3.

Nenhuma nova release foi enviada ou publicada. Nenhum cluster ou dado produtor
foi alterado. O worktree compartilhado anterior foi preservado, sem commits.
