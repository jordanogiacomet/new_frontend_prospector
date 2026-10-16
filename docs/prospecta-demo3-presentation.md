# Prospecta — roteiro de apresentação do MVP

O MVP reúne a rotina **importar → acompanhar → revisar → encontrar contatos**.
A demonstração mostra a análise registrada e a consulta de profissionais no
detalhe de cada empresa. A pipeline saiu da navegação; acompanhamentos e
históricos existentes continuam preservados.

## Preparar a apresentação

Para ensaiar a consulta local com exemplos fictícios, sem banco ou integrações:

```bash
pnpm install --frozen-lockfile
pnpm demo:safe
```

Abra `http://127.0.0.1:3012/inicio`. O aviso de demonstração identifica os dados
fictícios e a consulta. Esse modo oferece análise em leitura;
importações e contatos não são habilitados. `PROSPECTA_PORT=3013 pnpm demo:safe`
permite escolher outra porta em loopback. Encerre com `Ctrl+C`.

O UAT completo das telas usa um servidor isolado e respostas sintéticas,
incluindo o envio e as alterações comerciais. Consulte
[`tests/browser/README.md`](../tests/browser/README.md) para preparar Playwright
e executar os dois comandos. O resultado final informa `PASS`, o número de
checagens e `syntheticOnly: true`. Os POST/PATCH desse ensaio ficam no navegador;
nenhum arquivo é enviado a n8n e nenhuma alteração é gravada em banco.

Para apresentar o ambiente Demo 3 já existente, use o endereço local aprovado
`https://192.168.0.20:30443/inicio` e o acesso do gateway. Essa apresentação usa
o que já estiver instalado, que pode diferir desta interface local; os comandos
acima não atualizam o ambiente. Dados reais ficam na consulta autorizada e
não devem entrar em capturas, fixtures ou
evidência do repositório.

## Roteiro de 7 minutos

| Tempo | Tela e ação | Mensagem para o gestor |
| --- | --- | --- |
| 1 min | **Início**: mostrar o roteiro e os atalhos B/C. | “A rotina começa com uma lista. Revisamos a empresa antes de procurar os profissionais.” |
| 1 min | **Importações**: mostrar o formulário; no ensaio sintético, selecionar e enviar o CSV de exemplo uma vez. | “O recebimento da lista fica registrado. Se o retorno for desconhecido, consultamos o histórico antes de reenviar.” |
| 1 min | **Acompanhar importações** → **Ver detalhes**. | “A situação mostra apenas os resultados confirmados. Informação indisponível continua indisponível, sem virar zero.” |
| 2 min | **Prioridade B** ou **C** → **Abrir análise**: avaliação comercial, motivo, fundamentos, relatório e histórico. | “Primeiro decidimos se a empresa merece esforço comercial. A análise orienta prospectar, validar, acompanhar ou não abordar. Uma pontuação alta, sozinha, não aprova a prospecção.” |
| 1 min | No detalhe da empresa, **Encontrar contatos** → **Localizar empresa pelo nome** ou **Domínio da empresa**. | “A consulta começa nesta empresa. Confirmamos a empresa encontrada, revisamos os profissionais e escolhemos quais canais revelar.” |
| 1 min | **Ajuda** e retorno ao **Início**. | “O aplicativo orienta a operação e distingue falta de acesso, consulta indisponível e resultado desconhecido.” |

No modo de consulta fictícia, explique o envio e a consulta de contatos pelo
roteiro de UAT; esses controles não são habilitados. No Demo 3, a navegação
mostra somente o que o perfil e os gates do ambiente permitem. Custos,
contatos, mapas e geração de mensagem dependem das respectivas configurações;
ausência de acesso ou de contrato aprovado deve aparecer como tal.

Na seção **Contatos profissionais**, o domínio começa vazio. Informe um domínio
conferido ou localize a empresa pelo nome e confirme o resultado em **Usar esta
empresa**. Abrir a análise não inicia consultas. A busca exige as permissões
de buscar e visualizar contatos; a revelação depende de permissão adicional.
Mostre o resultado de cada fornecedor e o motivo confirmado, quando recebido:
nenhum resultado, acesso recusado, limite de
consultas ou falha. Se a integração não enviar esse diagnóstico, a tela
informa “motivo não informado”; isso não comprova ausência de contatos.
Revelar um canal continua uma escolha humana, e não envia mensagens.

A **Avaliação comercial** responde à decisão sobre a empresa antes de procurar
uma pessoa: mostra a recomendação registrada, seu motivo e a data da análise.
Leia os fundamentos e a confiança quando houver cautela ou revisão pendente.
O painel mantém esses fatos; a consulta de contatos fica em uma seção própria,
logo abaixo. Links antigos da pipeline abrem **Leads**, com os filtros de
empresa compatíveis. Atualizar a análise conserva o pedido de contatos em
andamento e não inicia outra tentativa.

## Checagem antes de apresentar

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:scripts
pnpm test:contract
pnpm build:safe
```

Execute o UAT de navegador depois desses comandos, em sequência. Dev, typecheck
e build compartilham `.next` e devem rodar separados. `build:safe` usa a
configuração sintética, sem conexão com banco ou integrações; não copie
credenciais ou valores reais para os comandos de verificação.

As checagens locais demonstram a base da aplicação e o uso das telas. A
validação de PostgreSQL, gateway e contratos externos no alvo Demo 3 continua
separada da verificação sintética. Esta alteração local não inclui migração,
publicação, mudança de fornecedor ou ativação de workflow. Consulte a evidência
da release instalada para saber quais mudanças já chegaram ao ambiente, sem
incluir dados reais em capturas ou logs.
