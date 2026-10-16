# MVP apresentável na Demo 3

Data: 06/10/2026. O proprietário pediu que o escopo existente funcione
minimamente e faça sentido para apresentar ao chefe, deixando infraestrutura
para depois. Em seguida pediu concluir o front de contatos e publicar no
Kubernetes existente em `https://192.168.0.20:30443`. Esta entrega fecha a base
de aplicação já implementada e corrige
falhas encontradas no percurso; não cria outro produto ou integrações.

| ID | Critério verificável |
| --- | --- |
| MR-01 | Início, ajuda e roteiro ligam importação, revisão e acompanhamento comercial com ações controladas pelas permissões existentes. |
| MR-02 | Importação continua explícita, sem reenvio automático; aceitação desconhecida, contagens ausentes e consultas indisponíveis têm significado honesto. |
| MR-03 | Todas as superfícies de consulta oferecidas respeitam capabilities antes de GET, distinguem sessão expirada de acesso negado e retiram dados após 401/403. |
| MR-04 | Cadência, acompanhamento, nota e atividade mostram dados canônicos e auditoria atualizados depois de gravação confirmada; rascunhos existentes continuam protegidos. |
| MR-05 | Navegador sintético verifica percurso gerencial e comercial, recuperação e navegação em desktop/celular sem banco ou provedores reais. |
| MR-06 | README e roteiro explicam execução local, o perfil exato Demo 3, recursos condicionais e a distinção entre código validado e release publicada. |
| MR-07 | Lint, typecheck, suíte completa, scripts, contratos locais e build com ambiente sanitizado passam, com evidência e limitações registradas. |
| MR-08 | Publicar uma release imutável no alvo Demo 3 exato após preflight, aplicar somente migrações app-owned e verificar gateway/HTTPS e saúde sem armazenar valores reais. |

## Decisões e limites

- Reusar páginas, permissões, DTOs, fixtures e serviços existentes.
- Alterar somente falhas concretas, orientação do percurso e verificações.
- Sem alteração de notas, prioridades ou recomendações do produtor.
- Contatos, IA e mapas continuam sujeitos aos seus próprios gates; não há
  envio de mensagens, automação de outreach, exportação ou nova qualificação.
- Testes usam somente dados sintéticos em loopback. Postflight remoto registra
  apenas status e metadados operacionais, nunca valores reais de respostas.
- O pedido posterior autoriza publicação da aplicação nesse alvo Kubernetes.
  Não autoriza atualização/ativação de n8n ou chamadas reais a provedores.
- Preservar o worktree compartilhado; não agrupar mudanças anteriores em commit.

## Referências

- `.specs/features/mvp-application-foundation-v1/`
- `.notebook/prospecta-frontend-operations.md`
- `.specs/codebase/TESTING.md`
- `docs/prospecta-manager-guide.md`
