# Quick Task 002: Feedback da consulta de empresa

**Date:** 2026-08-11
**Status:** Done

## Description

Tornar visível quando **Ver empresa localizada** apenas consulta um pedido
pendente ou desconhecido, sem disparar novamente o provedor.

## Files Changed

- `src/components/contacts/contact-enrichment-action.tsx` — apresenta feedback
  pendente e separa uma nova busca manual após resultado desconhecido.
- `src/components/contacts/contact-enrichment-action.test.tsx` — reproduz o
  clique sem mudança aparente e prova que as consultas repetidas são somente
  GET.

## Verification

- [x] Estado ainda pendente informa que a busca continua processando.
- [x] Resultado desconhecido explica que a leitura não reenvia o provedor.
- [x] Nova tentativa exige ação separada e avisa sobre possível novo crédito.
- [x] Reiniciar apenas redefine a interface; não envia uma requisição sozinho.
- [x] Teste focado, lint, TypeScript, suíte completa e build passaram.
- [x] Release Demo 3 passou preflight, readiness e smoke autenticado.

## Commit

Não criado: os mesmos arquivos pertencem ao conjunto de mudanças ainda não
commitado da feature de enriquecimento; um commit parcial seria enganoso.
