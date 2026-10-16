# UAT sintético do MVP

Execute os comandos na raiz do repositório, depois de instalar as dependências
com `pnpm`. Disponibilize Playwright e Chromium em um diretório separado; esses
testes não adicionam dependências ao aplicativo.

O caminho padrão do módulo é
`/tmp/prospecta-browser-verify/node_modules/playwright/index.mjs`, e o dos
navegadores é `/tmp/prospecta-browser-verify/browsers`.

Para preparar essa instalação separada:

```bash
mkdir -p /tmp/prospecta-browser-verify
pnpm --dir /tmp/prospecta-browser-verify add playwright@1.57.0
PLAYWRIGHT_BROWSERS_PATH=/tmp/prospecta-browser-verify/browsers pnpm --dir /tmp/prospecta-browser-verify exec playwright install chromium
```

Em um terminal, inicie o servidor sintético:

```bash
node tests/browser/run-manager-import-analysis.mjs
```

Em outro terminal, execute o roteiro:

```bash
node tests/browser/manager-import-analysis.mjs
```

Para usar uma instalação diferente:

```bash
PLAYWRIGHT_MODULE_PATH=/seu/diretorio/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/seu/diretorio/browsers node tests/browser/manager-import-analysis.mjs
```

O servidor fica em `127.0.0.1:3100`, usa apenas identidade sintética e endereços
de banco indisponíveis em loopback. O launcher mascara as configurações
conhecidas do servidor e desabilita as integrações. Ele não define equivalentes
`NEXT_PUBLIC_` porque esses nomes são rejeitados pelo aplicativo;
ele não lê arquivos de ambiente reais. O Next pode carregar esses arquivos,
mas os valores conhecidos já estão substituídos no processo.

O navegador intercepta todas as APIs com respostas sintéticas, bloqueia
conexões externas e mutações inesperadas. Por padrão, não grava imagens.
O roteiro verifica em 1366, 1440, 375 e 390 pixels:

- identidade Prospecta, idioma, metadados e headers de proteção;
- início sem a pipeline removida; menu compacto no celular,
  abertura e fechamento por teclado e retorno de foco ao escolher a área atual;
- recusa de CSV vazio, extensão/tipo incorretos e tamanho acima de 10 MiB antes do POST;
- envio de bytes exatos com chave única, segundo arquivo explícito e resultado visível após envio;
- confirmação individual no canto somente após resultado final de cada empresa,
  inclusive com a lista de importações aberta; respostas 202 e linhas recebidas
  não geram confirmação de processamento;
- resultados antigos não reaparecem como avisos ao abrir a lista; resultados
  novos usam fila de avisos, fechamento por teclado e deduplicação nos GETs
  depois de navegar ao detalhe, preservando contagens indisponíveis e sem
  antecipar a conclusão do lote;
- aviso ocultável/reabrível com teclado, preservação da tentativa, retorno
  recebido com aviso oculto e saída protegida durante o envio;
- lotes com contagens indisponíveis, encerramento sem falsa conclusão e recuperação por GET;
- revisão B/C, detalhe, histórico e retorno com filtros;
- filtros de estado em rascunho até Aplicar filtros ou Enter;
- aviso de filtros de empresas pendentes, descarte local e foco nos erros;
- consultas sem correspondência oferecem limpeza preservando os filtros
  aprovados; o retorno do detalhe de uma importação conserva sua página e
  quantidade de registros;
- avaliação comercial antes dos dados complementares, recomendação e motivo,
  ausência de CTA de contatos e score alto sem substituir “não abordar”;
- Ajuda, estado vazio de empresas fora da análise e página inexistente com retorno ao início;
- contatos diretamente na empresa, com estado de acesso negado quando as
  permissões estão ausentes e sem pedidos de busca ou revelação;
- endereço antigo da pipeline redireciona a Leads preservando o CNPJ e sem
  consultar a fila;
- acompanhamento histórico acessível por endereço direto: próxima ação com
  versão, atividade, nota, auditoria, consulta da cadência e retorno a Leads;
- 401/403 distintos, retirada de dados e interrupção das consultas da lista e
  das confirmações; a espera de um intervalo de polling é verificada em 1366px;
- respostas de aceite desconhecido (202 válido, 202 inválido e POST 503), sem novo envio;
- ausência de conexões externas, mutações inesperadas, erros de runtime e overflow horizontal.

As alterações comerciais existem somente na memória do interceptador do
navegador. Esse teste verifica o uso das telas e seus contratos, sem demonstrar
persistência em PostgreSQL ou a execução de n8n. Custos fica oculto para o ator
sem permissão; nenhum gate real de custos, contatos, IA, relatório sensível ou mapa
externo é habilitado. A criação e o registro de contatos da cadência, os direitos
de contatos e os contratos de integrações têm testes próprios; este UAT não os
aciona.

As confirmações usam respostas sintéticas paginadas de
`GET /api/imports/:id?processedCompaniesPage=1&pageSize=100`, com a fonte
`producer_current_company_results_v1` e apenas linha e horário do resultado
final. O interceptador mantém o recebimento do CSV separado desses resultados:
somente a liberação explícita de resultados finais durante o roteiro gera os
avisos. Nenhum dado real ou gate remoto é usado.

Para uma revisão visual apenas das respostas sintéticas, informe
`PROSPECTA_BROWSER_SYNTHETIC_SCREENSHOTS=/tmp/prospecta-manager-uat` ao executar
o roteiro. Essa opção grava Início, importação, lista de empresas, contatos na
empresa e acompanhamento histórico, além de filtros de empresas pendentes,
em todas as quatro larguras verificadas;
nunca aponte o roteiro para dados reais.

`PROSPECTA_BROWSER_PORT` altera a porta do launcher; nesse caso, informe o
mesmo endereço em `PROSPECTA_BROWSER_BASE_URL` ao executar o roteiro. O roteiro
aceita apenas HTTP em loopback, sem credenciais, caminho adicional ou query.
Não use o launcher junto com typecheck/build. Encerre seu servidor com
`Ctrl+C` depois do teste.

Para apenas conferir a sintaxe dos dois scripts, sem iniciar servidor:

```bash
node --check tests/browser/run-manager-import-analysis.mjs
node --check tests/browser/manager-import-analysis.mjs
```

O roteiro de apresentação ao gestor está em
[`docs/prospecta-demo3-presentation.md`](../../docs/prospecta-demo3-presentation.md).
