# Code Conventions

**Analyzed:** 2026-07-16

## Naming and Organization

- Files use kebab-case; React components and types use PascalCase; functions and
  variables use camelCase; constants use camelCase or descriptive lowercase.
- Route handlers live beside route tests under `src/app/api`.
- Domain logic stays in `src/server`; components do not contain SQL.
- Tests are co-located as `*.test.ts` or `*.test.tsx`.

## Type Safety

- Strict TypeScript, `readonly` DTO fields, discriminated unions for UI state,
  and runtime validators for untrusted responses.
- `any` is avoided. Unknown input is narrowed through Zod or local predicates.

## Error Handling

- Server errors map through `mapApiError()` and never expose SQL, credentials,
  producer payloads, or stack traces.
- UI request state distinguishes authentication, authorization, unavailable,
  not-found, conflict, and generic failure where supported.

## Imports and Formatting

- External imports precede repository-relative imports.
- Semicolons and double quotes are used consistently.
- Brazilian display formatting lives in `src/lib/formatters`.
