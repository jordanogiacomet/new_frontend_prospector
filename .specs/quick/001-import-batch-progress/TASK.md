# Quick Task 001: Link envio ao acompanhamento do lote

**Date:** 2026-07-15
**Status:** Done

## Description

Após um CSV ser registrado, direcionar o usuário ao detalhe privado do lote
correspondente sem transformar o `202` em aceite ou conclusão.

## Files Changed

- `src/app/(private)/imports/page.tsx` — conservar apenas um `submissionId`
  UUID validado e oferecer a ação de acompanhamento.
- `src/app/(private)/imports/page.test.tsx` — validar a ação para os dois
  resultados `202` e a recusa segura de identificador inválido.

## Verification

- [x] A confirmação ou o resultado desconhecido oferecem o link para
  `/imports/batches/:submissionId` apenas quando o UUID é válido.
- [x] O identificador não é exibido como conteúdo da página e dados inválidos
  não viram URL.
- [x] A execução serial focada do Vitest para a página passa.
- [x] Lint, typecheck, suíte unitária serial e build com flags locais seguras
  passam.

## Commit

`feat(imports): link upload result to batch progress`
