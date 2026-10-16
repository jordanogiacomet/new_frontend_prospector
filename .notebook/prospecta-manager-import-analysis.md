# MVP do gestor: importar e revisar

Updated: 2026-10-06

## Escopo confirmado

O proprietário limitou o pedido de MVP, por enquanto, a importar CSV e analisar
as empresas que merecem revisão. Não expandir agenda/cadência/fechamento por
conta do pedido inicial de pipeline completa.

## Entradas e revisão

- `src/app/(private)/inicio/page.tsx:StartPage()` verifica a sessão no servidor
  e oferece importar, acompanhar lotes e revisar B/C/lista geral conforme as
  permissões independentes. Não consulta bancos nem cria métricas.
- `src/app/page.tsx:Home()`, login e marca apontam para `/inicio`; a entrada não
  presume `leads:read`. O item Importações continua apontando ao histórico
  para atores sem `imports:create`.
- `src/components/leads/lead-list-filters.tsx:LeadListFilters()` usa a mesma
  navegação canônica para atalhos B/C/R/todas. Preserva CNPJ, UF e pageSize
  aprovados, remove parâmetros desconhecidos e reinicia em page=1.
- Prioridade permanece um fato do produtor. A orientação de revisão combina
  recomendação, confiança, riscos e relatório; não recalcula scores.

## Importação desconhecida

- `src/app/(private)/imports/page.tsx:handleSubmit()` trata resposta 2xx
  irreconhecível, erro de rede e resposta 5xx como aceite desconhecido;
  conserva arquivo/chave na tela e bloqueia segundo submit. A confirmação
  requer o identificador UUID de um registro durável e um retorno reconhecido.
  Não oferecer nova chave como recuperação de uma resposta que pode ter
  ocorrido depois do aceite. A conservação é apenas durante a tela aberta,
  não uma promessa de persistência no navegador após recarregar.
- O seletor de arquivo fica desabilitado no HTML inicial até a hidratação.
  Isso impede uma seleção visual anterior ao React que deixava o estado do
  formulário vazio. Após confirmação, outro arquivo exige uma ação explícita
  que limpa o formulário e cria uma nova chave, sem POST automático.
- O retorno fica junto ao formulário e antes das orientações secundárias.
  `ResultState()` traz a seção terminal para a área visível sem animação;
  manter essa regressão no UAT de celular, sem scroll feito pelo teste.
- `src/app/(private)/imports/batches/[id]/page.tsx:BatchDetail()` preserva
  null/zero e distingue encerramento operacional de conclusão comprovada.
- O CTA dos lotes abre `/leads`, que contém empresas elegíveis de todas as
  importações. Não apresentá-lo como filtro dos resultados desse lote.

## Uso cotidiano

- Situação e resultados precedem identificação/origem recolhidas em detalhes.
  Histórico de análises mantém a razão visível e os identificadores fechados.
- Atualizar lista/situação repete apenas GET. Uma falha preserva a consulta
  anterior com aviso; 401/403 removem os dados anteriores. Null não vira zero.
- O UAT usa somente loopback e respostas sintéticas, intercepta todas as APIs,
  bloqueia conexões externas e mutações inesperadas, e testa desktop/celular.
  Scripts e reprodução: `tests/browser/README.md`.

## Recuperação das leituras no MVP

- `src/app/(private)/leads/outside-analysis/page.tsx:OutsideAnalysisPage()` e
  seu detalhe aplicam `leads:read` antes de GET. Lista e
  `src/components/leads/lead-history.tsx:LeadHistory()` interrompem polling
  após 401/403, retiram o resultado anterior e distinguem sessão expirada de
  permissão negada; `PrivateReadAccessState()` reúne a orientação de retorno.
- Fora da análise preserva a última consulta com aviso em falha temporária;
  atualização e recuperação repetem somente GET. Lista principal e Fora da
  análise validam cada item antes de entregar dados à tabela.
- `src/app/(private)/imports/page.tsx:handleSubmit()` trava por ref a tentativa
  antes de aguardar a renderização. Dois eventos de submit no mesmo ciclo não
  iniciam dois POSTs. `isImportSuccessPayload()` exige os fatos do recebimento;
  acknowledgement incompleto permanece desconhecido. O count zero do retorno
  legado continua aceito sem significar zero resultados ou lote concluído.
- As APIs de Fora da análise exigem permissão no servidor antes do banco e
  não possuem branch de fixtures. No perfil local `demo:safe`, uma fonte
  indisponível continua indisponível; não inferir atividade produtora.

## Operação Demo 3

- O kubeconfig global pode apontar para um laboratório diferente. O acesso
  renovado da Demo 3 está no kubeconfig dedicado
  `/home/jordanogiacomet/.kube/prospecta-demo3.conf` (0600, fora do repo).
- Sempre definir `KUBECONFIG` nesse arquivo e executar o preflight existente;
  caminho/certificado disponível não substituem API/UID/marker/context match.
- `DEMO3_RELEASE_ID` pode ser passado como variável de ambiente, sem copiar ou
  imprimir `.env.demo3.local`. Overrides existentes precedem process.loadEnvFile.
- Na preparação inicial, o proprietário pediu implementação primeiro e
  infraestrutura depois. O pedido seguinte de 06/10/2026 autorizou publicação
  no HTTPS30443: `demo3-preprod-20261006-mvp-feedback-001` foi confirmada com
  migração017 e 26 checks HTTPS. A segunda release de avaliação/pipeline é
  rastreada em `.specs/features/sales-pipeline-mvp-v1/`.

Spec/tarefas/evidência: `.specs/features/manager-import-analysis-mvp-v1/`.
Guia do operador: `docs/prospecta-manager-guide.md`.

## Verificação final

Em 2026-10-06, lint, typecheck, 2.377 testes em 129 arquivos e build de produção
com ambiente sanitizado passaram. O UAT sintético passou 132 verificações em
1366, 1440, 375 e 390px, incluindo bytes exatos, retorno visível, unknown/503
sem repetição, recuperação GET, filtros e identificadores recolhidos. Zero
conexões externas, mutações inesperadas ou erros de JavaScript. Servidor de
UAT encerrado antes dos gates de `.next`; nenhuma publicação na Demo 3.
