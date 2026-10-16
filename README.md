# Prospecta

Workspace interno de prospecção assistida: importar uma lista EmpresaAqui,
acompanhar o recebimento e as observações confirmadas, revisar empresas e
organizar o próximo contato. A análise do produtor é consultada em leitura;
o acompanhamento comercial é gravado apenas no banco da aplicação.

## Percurso do MVP

1. **Início:** roteiro e atalhos conforme o acesso da pessoa.
2. **Importações:** um CSV por envio explícito e histórico consultável.
3. **Empresas:** filtros B/C e gerais, análise, riscos, relatório e histórico.
4. **Pipeline de prospecção:** empresa, etapa, próxima ação e prazo; cadência manual,
   atividades, notas e auditoria conforme as permissões.
5. **Ajuda:** orientação dentro do aplicativo e recuperação de acesso.

Recebimento não significa análise concluída. Contagens desconhecidas continuam
indisponíveis; um envio com resultado desconhecido não é repetido
automaticamente. A etapa comercial não altera a recomendação do produtor.
Preparar ou copiar uma abordagem não envia mensagens.

O [guia de uso](docs/prospecta-manager-guide.md) explica o percurso. O
[roteiro de apresentação da Demo 3](docs/prospecta-demo3-presentation.md)
organiza uma demonstração de 7 minutos, com preparação e alternativas para
recursos indisponíveis.

## Executar localmente

Use Node **22.18 ou superior da série 22** e **pnpm 10.34.4**.

```bash
pnpm install --frozen-lockfile
pnpm demo:safe
```

Abra [http://127.0.0.1:3012/inicio](http://127.0.0.1:3012/inicio).
Essa demonstração usa exemplos fictícios em consulta, sem banco, importação,
gravação comercial ou integrações externas. A faixa do aplicativo identifica
essa limitação. `PROSPECTA_PORT=3019 pnpm demo:safe` muda somente a porta local.

Para desenvolvimento com configuração própria, mantenha os valores reais
somente em `.env.local` usando `.env.example` como referência:

```bash
pnpm check:config
pnpm dev
```

`check:config` verifica formato sem conectar a banco/provedor e sem imprimir
valores. Uma configuração válida não comprova conectividade nem aprovação do
alvo. O desenvolvimento com dados exige perfil isolado, credenciais e
permissões apropriados; placeholders não habilitam fluxos reais.

Para conferir o build sem utilizar configurações de integrações reais:

```bash
pnpm build:safe
```

O comando executa o build Next com placeholders e features desabilitadas.
As configurações conhecidas do servidor são sobrescritas no processo, sem
alterar os arquivos de ambiente. Para um build configurado, `pnpm build`
continua disponível. Não execute build/typecheck junto de um servidor dev.

Depois de um build e com configuração de runtime validada, `pnpm start`
inicia o standalone em loopback, copiando os assets necessários. Esse comando
local não aceita os grants de runtime Demo 2/3; a Demo 3 usa o gateway e a
release específica existentes.

Se `pnpm` não estiver no PATH, use `npx --yes pnpm@10.34.4 <comando>`.

## Verificar o aplicativo

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:scripts
pnpm test:contract
pnpm build:safe
```

Os contratos locais verificam artefatos e políticas; não comprovam integração
remota. O [UAT de navegador](tests/browser/README.md) usa somente respostas
sintéticas e bloqueia acesso externo. Integrações PostgreSQL exigem um alvo
descartável separado; nunca execute testes contra dados reais.

## Demo 3

O perfil exato é a pré-produção local de um único testador, com gateway
autenticado em [https://192.168.0.20:30443/inicio](https://192.168.0.20:30443/inicio).
Ele consulta fatos reais por conexão de leitura aprovada e mantém as
gravações Prospecta em PostgreSQL isolado. Não é a demonstração de fixtures
nem um perfil de produção. A identidade compartilhada e HTTP na LAN são
limitações aceitas somente para esse alvo.

Contatos, revelação, IA, mapas e custos dependem de configurações, permissões
e políticas próprias. A exceção HTTP de importação não habilita transporte
de contatos. Nenhum recurso pendente deve ser habilitado para a apresentação.

Em 06/10/2026, o proprietário pediu concluir o front de contatos e depois
publicar no Kubernetes desse alvo HTTPS. A publicação usa o preflight exato
e a migração aditiva app-owned `017`. Os limites e preflights ficam em
[AGENTS.md](AGENTS.md); o resultado da release fica na
[evidência da entrega](.specs/features/demo3-mvp-readiness-v1/evidence/verification-2026-10-06.md).
Os motivos de Lusha/Apollo dependem do diagnóstico enviado pela integração:
callbacks anteriores continuam válidas e mostram “motivo não informado”.
O deploy da aplicação não atualiza ou ativa workflows n8n.

Em 13/10/2026, a melhoria de feedback foi publicada na release
`demo3-preprod-20261013-ux-feedback-001`, substituindo somente a imagem da
aplicação e preservando as credenciais atuais. Rollout e 17 checks HTTPS
passaram; detalhes e rollback estão na
[evidência da publicação](docs/prospecta-ux-feedback-deploy.md).

Em 14/10/2026, as melhorias de UX do gestor e de continuidade das listas foram
publicadas na release `demo3-preprod-20261014-ux-continuity-001`, revisão 69.
Somente a imagem da aplicação mudou; 22 checks HTTPS passaram. Detalhes e
rollback estão no [registro do deploy](docs/prospecta-ux-list-continuity-deploy.md).

## Limites de escopo

Sem disparo automático de contato, reprocessamento, alteração da análise,
exportação em massa ou sincronização CRM. Nunca gravar dados reais em
fixtures, screenshots, logs de teste ou evidências do repositório.
