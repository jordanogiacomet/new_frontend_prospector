# Quick Task 001: Link envio ao acompanhamento do lote

**Date:** 2026-07-15
**Status:** Done

## Delivered

- A tela de importação conserva somente o `submissionId` que passa a validação
  UUID no navegador.
- As respostas `202` de recebimento confirmado e resultado desconhecido agora
  oferecem o link privado **Acompanhar progresso do lote**.
- O link usa o detalhe já existente, que mantém os fatos, contagens nulas e
  estados do contrato de lote; o `202` não é promovido a aceite ou conclusão.
- Identificadores inválidos são descartados e não formam uma URL.

## Files

- `src/app/(private)/imports/page.tsx`
- `src/app/(private)/imports/page.test.tsx`

## Verification

- Focused test, serial: 20 passed.
- Full unit suite, serial: 68 files / 1,632 tests passed.
- `pnpm lint`: passed with 3 pre-existing warnings outside this task.
- `pnpm typecheck`: passed.
- Production-safe build passed with only process-local overrides that disable
  development bypass and Demo 2 flags. The unmodified local profile correctly
  fails production build because those flags are enabled.

## Commit

`feat(imports): link upload result to batch progress`
