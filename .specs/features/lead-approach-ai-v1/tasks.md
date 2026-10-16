# Lead approach AI v1 — Tasks

**Design**: `.specs/features/lead-approach-ai-v1/design.md`
**Status**: Profile-fit refinement published on the approved Demo 3 target

All work is sequential in the primary agent because the shared worktree is
already dirty and repository instructions prohibit unsolicited delegation.

| Task | Depends on | Tests / gate | Requirement | Status |
| --- | --- | --- | --- | --- |
| T1: Block internal research metadata in the local formatter | None | Formatter unit / quick | LAAI-01 | Complete |
| T2: Add fail-closed OpenAI environment configuration | T1 | Environment unit / quick | LAAI-05, LAAI-08 | Complete |
| T3: Implement bounded report context and OpenAI Responses client | T2 | Service unit / quick | LAAI-04..LAAI-06, LAAI-08 | Complete |
| T4: Add authenticated same-origin lead approach route | T3 | Route unit / quick | LAAI-02..LAAI-05 | Complete |
| T5: Add the explicit generation interaction to the lead component | T4 | Component/page unit / quick | LAAI-02, LAAI-07 | Complete |
| T6: Document and run the complete release-quality gate | T5 | lint, typecheck, test, build | LAAI-01..LAAI-08 | Complete |
| T7: Require Apollo presentation, relevant capability and concrete proposal | T6 | Service unit / quick | LAAI-04, LAAI-06, LAAI-09 | Complete |
| T8: Re-run the complete release-quality gate | T7 | lint, typecheck, test, build | LAAI-01..LAAI-09 | Complete |
| T9: Replace the premature project proposal with one grounded discovery question | T8 | Service prompt/output tests and synthetic provider evaluation | LAAI-09, LAAI-10 | Complete |
| T10: Re-run the complete local quality gate | T9 | lint, typecheck, test, build | LAAI-01..LAAI-10 | Complete |
| T11: Publish and verify the tone refinement on the approved Demo 3 target | T10 | Exact target/TLS preflight, immutable rollout and value-free postflight | LAAI-01..LAAI-10 | Complete |
| T12: Route one report-supported Apollo capability and reject redundant or unsupported offers | T11 | Service prompt/output unit tests / quick | LAAI-11..LAAI-13 | Complete |
| T13: Run the complete local quality gate and record evidence | T12 | lint, typecheck, test, contract, build | LAAI-01..LAAI-13 | Complete |
| T14: Publish and verify the profile-fit refinement on the approved Demo 3 target | T13 | Exact target/TLS preflight, immutable rollout and value-free postflight | LAAI-01..LAAI-13 | Complete |

## Validation checks

| Check | Result |
| --- | --- |
| Granularity | Each task owns one cohesive formatter, configuration, service, route, UI or validation deliverable. |
| Dependencies | The table order matches T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8. |
| Test co-location | Formatter/config/service/route/component changes include the unit type required by `.specs/codebase/TESTING.md`. |

## Tool and skill selection

- Workspace inspection/editing and local Vitest/ESLint/TypeScript/Next gates.
- Official OpenAI documentation for the Responses and structured-output
  contracts.
- `codenavi`, `tlc-spec-driven`, `coding-guidelines`, `frontend-design` and
  `openai-docs` as recorded for this implementation.

No atomic commits will be created during this task because the relevant files
already coexist with the owner's uncommitted work; verification evidence will
be recorded without taking ownership of unrelated changes.
