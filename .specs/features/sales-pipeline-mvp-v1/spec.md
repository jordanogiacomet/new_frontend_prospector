# Pipeline direta para o gestor

Em 06/10/2026, após o primeiro deploy do front de contatos, o proprietário
pediu reimplementar a apresentação da pipeline de modo agradável e direto,
pois o gestor não usará muitos dos controles atuais. Integra a segunda
publicação junto da avaliação comercial da empresa.

| ID | Critério verificável |
| --- | --- |
| PM-01 | A lista principal mostra empresa/localidade, etapa comercial, próxima ação e prazo, com um CTA principal de abrir/iniciar acompanhamento. |
| PM-02 | Avaliação comercial tem acesso secundário claro; contato não é o destino obrigatório da revisão da empresa. |
| PM-03 | Contagens repetidas, painel de atenção duplicado e detalhes extensos saem da visão principal; alertas de prazo ficam junto da empresa. |
| PM-04 | Etapa é filtro direto; filtros avançados ficam em disclosure com filtros ativos visíveis, mantendo query/paginação server-side existentes. Não inventar busca por nome não suportada. |
| PM-05 | Fatos complementares, mensagens e contatos ficam sob escolha explícita. Abrir a lista não provoca POST de IA/contatos; preparação de mensagem passa a um clique por empresa. |
| PM-06 | Permissões, 401/403, retirada de dados, loading/empty/error, nullable/unavailable, contexto de retorno e idempotência/sem retry permanecem seguros. |
| PM-07 | Desktop/mobile ficam legíveis, sem overflow horizontal, com identidade existente e rótulos empresariais concisos. |
| PM-08 | Regressões relevantes, lint/typecheck/test/build e UAT sintético passam; publicar uma segunda release no Demo 3 HTTPS com postflight sem dados reais registrados. |

Sem novo serviço/endpoint, migration adicional, alteração de score/recomendação, canal,
direitos, policy de contatos ou automação de outreach. Recursos disponíveis
permanecem acessíveis sob demanda, sujeitos aos gates existentes.

A única extensão API é `meta.approachPreparationEnabled`, calculada pelos
gates existentes de IA/credenciais/permissões e independente da opção de
geração automática. O boolean legado permanece compatível; GET continua
somente leitura e nenhum segredo integra o DTO.

Direção visual: lista editorial compacta, tipografia atual e divisões leves,
com hierarquia clara de nome/etapa/próximo passo. Sem novos charts ou métricas.
