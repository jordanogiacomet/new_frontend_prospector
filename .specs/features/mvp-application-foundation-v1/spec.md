# Base da aplicação para o MVP

Data: 06/10/2026. O proprietário pediu completar o que uma aplicação precisa
para rodar como MVP, depois da entrega de importação e análise. Este trabalho
completa a base de uso e execução do escopo atual. Publicação e infraestrutura
continuam adiadas por instrução explícita anterior.

| ID | Comportamento verificável |
| --- | --- |
| AF-01 | Erro inesperado, página inexistente e carregamento têm interface em português, retorno ao aplicativo e nenhum detalhe interno de erro. Recuperação não repete mutações. |
| AF-02 | Ajuda dentro do aplicativo exige sessão verificada, usa linguagem de negócio e mostra ações somente por permissão. Demonstração com fixtures se identifica como consulta com dados fictícios. |
| AF-03 | Sessão expirada e acesso negado são distintos. Dados anteriores são retirados, consultas periódicas param e 401 orienta entrar novamente; 403 não oferece retry de operação sem permissão. |
| AF-04 | Arquivo vazio, maior que o limite superficial e tipo/extensão inválidos são recusados antes do POST. Permissões negadas não iniciam consultas; regra de CNPJ/qualificação continua no produtor. |
| AF-05 | Identidade do Prospecta no navegador, ícone local e orientações de não indexação estão presentes. Headers de resposta limitam framing, referrer e MIME sniffing sem romper o perfil HTTP local autorizado. |
| AF-06 | Comando de configuração usa o parser vigente, não chama banco/provedor e informa erros sem mostrar valores. Validação de formato não é apresentada como conectividade ou aprovação do alvo. |
| AF-07 | Uma demonstração local reproduzível usa fixtures existentes, loopback, banco indisponível e integrações desabilitadas; nenhuma mutação ou falso processamento é habilitado. |
| AF-08 | Instalação/runtime/package manager e execução standalone com assets são documentados e verificáveis. Comando local não publica, migra ou modifica alvos externos. |
| AF-09 | Lint, TypeScript, testes de aplicativo/scripts, build sanitizado e navegador sintético passam; limitações e contagens ficam registradas. |

## Decisões

- Reusar Next 16.2.9, autenticação, permissões, validação de ambiente e fixtures
  existentes. Nenhuma dependência adicional do aplicativo.
- Não criar cadastro/senha próprios: o aplicativo já usa identidade corporativa
  ou o perfil exato Demo 3 autenticado pelo gateway.
- Não habilitar features cujo contrato/política externa estejam pendentes, nem
  criar automação de contato, CRM, exportação ou nova qualificação.
- Dados privados não recebem cache offline nem analytics externo. Metadados e
  robots orientam crawlers; não substituem autenticação.
- Testes usam apenas inputs e identidades sintéticos. Sem dados reais,
  PostgreSQL remoto, n8n, contatos ou IA nesta verificação.
- O worktree anterior é compartilhado e será preservado, sem commits globais.

## Referências de implementação

- `.notebook/prospecta-manager-import-analysis.md` e `docs/prospecta-manager-guide.md`.
- `src/server/env.ts:parseServerEnv()` e `src/server/demo/mode.ts`.
- `next.config.ts` já usa saída standalone; manter o modelo de release existente.
- [Next: error boundaries](https://nextjs.org/docs/app/api-reference/file-conventions/error),
  [página inexistente](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)
  e [headers](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers).
  A documentação mais nova tem `retry`; o pacote instalado 16.2.9 ainda usa
  `reset` para limpar a boundary sem solicitar refresh do servidor.
