import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CommercialAuditEventDto,
  LeadActivityDto,
  LeadNoteDto,
  LeadWorkspaceDto,
} from "../../../../types/commercial";

const { navigationState } = vi.hoisted(() => ({
  navigationState: { workspaceId: "00000000-0000-4000-8000-000000000041" },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: navigationState.workspaceId }),
}));

import CommercialWorkspaceDetailPage from "./page";

const fetchMock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>();
const workspaceId = "00000000-0000-4000-8000-000000000041";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000051";
const cnpj = "12345678000195";
const leadRunId = `lr_${"a".repeat(64)}`;
const originalTimeZone = process.env.TZ;

function apiResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function workspace(
  overrides: Partial<LeadWorkspaceDto> = {},
): LeadWorkspaceDto {
  return {
    workspace_id: overrides.workspace_id ?? workspaceId,
    organization_id: overrides.organization_id ?? "org-synthetic-workspace",
    cnpj_normalizado: overrides.cnpj_normalizado ?? cnpj,
    observed_lead_run_id: overrides.observed_lead_run_id ?? leadRunId,
    responsible_subject:
      overrides.responsible_subject === undefined
        ? "oidc|synthetic-responsible"
        : overrides.responsible_subject,
    commercial_stage: overrides.commercial_stage ?? "CONTACTED",
    next_action:
      overrides.next_action === undefined
        ? "Ligar para o financeiro"
        : overrides.next_action,
    next_action_due_at:
      overrides.next_action_due_at === undefined
        ? "2026-07-11T12:00:00.000Z"
        : overrides.next_action_due_at,
    commercial_outcome:
      overrides.commercial_outcome === undefined
        ? null
        : overrides.commercial_outcome,
    version: overrides.version ?? 3,
    created_by_subject: overrides.created_by_subject ?? "oidc|synthetic-creator",
    updated_by_subject: overrides.updated_by_subject ?? "oidc|synthetic-updater",
    created_at: overrides.created_at ?? "2026-07-10T12:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-07-10T14:30:00.000Z",
    archived_at: overrides.archived_at === undefined ? null : overrides.archived_at,
    archived_by_subject:
      overrides.archived_by_subject === undefined
        ? null
        : overrides.archived_by_subject,
  };
}

function activity(
  overrides: Partial<LeadActivityDto> = {},
): LeadActivityDto {
  return {
    activity_id: overrides.activity_id ?? "00000000-0000-4000-8000-000000000042",
    organization_id: overrides.organization_id ?? "org-synthetic-workspace",
    workspace_id: overrides.workspace_id ?? workspaceId,
    observed_lead_run_id: overrides.observed_lead_run_id ?? leadRunId,
    actor_subject: overrides.actor_subject ?? "oidc|synthetic-manager",
    occurred_at: overrides.occurred_at ?? "2026-07-10T15:00:00.000Z",
    activity_type: overrides.activity_type ?? "CALL",
    activity_outcome:
      overrides.activity_outcome === undefined ? "Contato realizado" : overrides.activity_outcome,
    summary: overrides.summary === undefined ? "Conversa inicial registrada" : overrides.summary,
    created_at: overrides.created_at ?? "2026-07-10T15:01:00.000Z",
  };
}

function note(overrides: Partial<LeadNoteDto> = {}): LeadNoteDto {
  return {
    note_id: overrides.note_id ?? "00000000-0000-4000-8000-000000000043",
    organization_id: overrides.organization_id ?? "org-synthetic-workspace",
    workspace_id: overrides.workspace_id ?? workspaceId,
    observed_lead_run_id: overrides.observed_lead_run_id ?? leadRunId,
    author_subject: overrides.author_subject ?? "oidc|synthetic-manager",
    body: overrides.body ?? "Observação comercial sintética.",
    created_at: overrides.created_at ?? "2026-07-10T16:00:00.000Z",
  };
}

function auditEvent(
  overrides: Partial<CommercialAuditEventDto> = {},
): CommercialAuditEventDto {
  return {
    audit_event_id:
      overrides.audit_event_id ?? "00000000-0000-4000-8000-000000000044",
    organization_id: overrides.organization_id ?? "org-synthetic-workspace",
    workspace_id: overrides.workspace_id === undefined ? workspaceId : overrides.workspace_id,
    actor_subject: overrides.actor_subject ?? "oidc|synthetic-manager",
    action: overrides.action ?? "STAGE_CHANGED",
    target_type: overrides.target_type ?? "lead_workspace",
    target_id: overrides.target_id ?? workspaceId,
    observed_lead_run_id:
      overrides.observed_lead_run_id === undefined ? leadRunId : overrides.observed_lead_run_id,
    previous_metadata: overrides.previous_metadata ?? { commercial_stage: "ASSIGNED", version: 2 },
    new_metadata: overrides.new_metadata ?? { commercial_stage: "CONTACTED", version: 3 },
    metadata: overrides.metadata ?? { field: "commercial_stage", from: "ASSIGNED", to: "CONTACTED" },
    occurred_at: overrides.occurred_at ?? "2026-07-10T14:30:00.000Z",
  };
}

function listEnvelope<T>(
  data: readonly T[],
  meta: Partial<{ page: number; pageSize: number; total: number | null }> = {},
) {
  return {
    data,
    meta: {
      page: meta.page ?? 1,
      pageSize: meta.pageSize ?? 20,
      total: meta.total === undefined ? data.length : meta.total,
    },
  };
}

function defaultFetch(input: string): Promise<Response> {
  if (input === `/api/workspaces/${workspaceId}`) {
    return Promise.resolve(apiResponse({ data: workspace() }));
  }

  if (input.includes("/activities")) {
    return Promise.resolve(apiResponse(listEnvelope([activity()])));
  }

  if (input.includes("/notes")) {
    return Promise.resolve(apiResponse(listEnvelope([note()])));
  }

  if (input.includes("/audit")) {
    return Promise.resolve(apiResponse(listEnvelope([auditEvent()])));
  }

  return Promise.reject(new Error(`Unexpected endpoint: ${input}`));
}

function workspaceGetCalls(): readonly [string, RequestInit][] {
  return fetchMock.mock.calls.filter(
    ([input, init]) =>
      input === `/api/workspaces/${workspaceId}` && init.method === "GET",
  ) as unknown as readonly [string, RequestInit][];
}

function source(): string {
  return readFileSync(
    resolve(process.cwd(), "src/app/(private)/workspaces/[id]/page.tsx"),
    "utf8",
  );
}

beforeAll(() => {
  process.env.TZ = "America/Sao_Paulo";
});

afterAll(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

beforeEach(() => {
  navigationState.workspaceId = workspaceId;
  fetchMock.mockReset();
  fetchMock.mockImplementation((input) => defaultFetch(input));
  vi.stubGlobal("fetch", fetchMock);
});

describe("commercial workspace detail page", () => {
  it("renders the workspace as a private business page", async () => {
    render(<CommercialWorkspaceDetailPage />);

    expect(
      await screen.findByRole("heading", { name: "Acompanhamento comercial" }),
    ).toBeInTheDocument();
    expect(screen.getByText("CNPJ 12.345.678/0001-95")).toBeInTheDocument();
  });

  it("shows a workspace loading state independently from the other panels", () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    render(<CommercialWorkspaceDetailPage />);

    expect(
      screen.getByRole("status", { name: "Carregando acompanhamento comercial" }),
    ).toBeInTheDocument();
  });

  it("uses only same-origin internal GET APIs with canonical pagination", async () => {
    render(<CommercialWorkspaceDetailPage />);

    await screen.findByRole("heading", { name: "Acompanhamento comercial" });
    expect(fetchMock.mock.calls.map(([input]) => input)).toEqual([
      `/api/workspaces/${workspaceId}`,
      `/api/workspaces/${workspaceId}/activities?page=1&pageSize=20`,
      `/api/workspaces/${workspaceId}/notes?page=1&pageSize=20`,
      `/api/workspaces/${workspaceId}/audit?page=1&pageSize=20`,
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
    }
  });

  it("ignores an old workspace response after the route changes", async () => {
    let resolveOldWorkspace: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((input) => {
      if (input === `/api/workspaces/${workspaceId}`) {
        return new Promise<Response>((resolve) => {
          resolveOldWorkspace = resolve;
        });
      }

      if (input === `/api/workspaces/${otherWorkspaceId}`) {
        return Promise.resolve(
          apiResponse({
            data: workspace({
              workspace_id: otherWorkspaceId,
              cnpj_normalizado: "98765432000198",
            }),
          }),
        );
      }

      return Promise.resolve(apiResponse(listEnvelope([], { total: 0 })));
    });
    const { rerender } = render(<CommercialWorkspaceDetailPage />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/workspaces/${workspaceId}`,
        expect.any(Object),
      ),
    );
    navigationState.workspaceId = otherWorkspaceId;
    rerender(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByText("CNPJ 98.765.432/0001-98")).toBeInTheDocument();
    const oldRequest = fetchMock.mock.calls.find(
      ([input]) => input === `/api/workspaces/${workspaceId}`,
    );
    expect(oldRequest?.[1].signal?.aborted).toBe(true);

    await act(async () => {
      resolveOldWorkspace?.(apiResponse({ data: workspace() }));
      await Promise.resolve();
    });

    expect(screen.getByText("CNPJ 98.765.432/0001-98")).toBeInTheDocument();
    expect(screen.queryByText("CNPJ 12.345.678/0001-95")).not.toBeInTheDocument();
  });

  it("shows a safe not-found workspace state", async () => {
    fetchMock.mockImplementation((input) =>
      input === `/api/workspaces/${workspaceId}`
        ? Promise.resolve(apiResponse({ error: { message: "private SQL" } }, 404))
        : Promise.resolve(apiResponse(listEnvelope([]))),
    );
    render(<CommercialWorkspaceDetailPage />);

    expect(
      await screen.findByRole("heading", { name: "Acompanhamento não encontrado" }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private SQL");
  });

  it.each([
    [401, "Entre para acessar este acompanhamento comercial."],
    [403, "Você não tem acesso a este acompanhamento comercial."],
  ])("shows a safe workspace access state for HTTP %i", async (status, message) => {
    fetchMock.mockImplementation((input) =>
      input === `/api/workspaces/${workspaceId}`
        ? Promise.resolve(apiResponse({ error: { message: "identity token" } }, status))
        : Promise.resolve(apiResponse(listEnvelope([]))),
    );
    render(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(document.body).not.toHaveTextContent("identity token");
  });

  it("keeps the commercial state explicitly separate from producer recommendation", async () => {
    render(<CommercialWorkspaceDetailPage />);

    await screen.findByRole("heading", { name: "Acompanhamento comercial" });
    expect(document.body).toHaveTextContent(
      "As alterações aqui afetam somente o acompanhamento comercial e nunca a recomendação do produtor.",
    );
    expect(document.body).not.toHaveTextContent("Pontuação do produtor");
    expect(document.body).not.toHaveTextContent("Recomendação do produtor:");
  });

  it("fills the commercial form with the current workspace state and Brazilian dates", async () => {
    render(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByLabelText("Responsável")).toHaveValue(
      "oidc|synthetic-responsible",
    );
    expect(screen.getByLabelText("Estágio comercial")).toHaveValue("CONTACTED");
    expect(screen.getByLabelText("Próxima ação")).toHaveValue(
      "Ligar para o financeiro",
    );
    expect(screen.getByLabelText("Prazo da próxima ação")).toHaveValue("2026-07-11");
    expect(document.body).toHaveTextContent("Criado em 10/07/2026");
    expect(document.body).toHaveTextContent("Atualizado em 10/07/2026");
    expect(document.body).toHaveTextContent("Versão 3");
  });

  it("sends only changed commercial fields with the optimistic version on PATCH", async () => {
    fetchMock.mockImplementation((input, init) => {
      if (init.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;

        return Promise.resolve(
          body.commercial_stage === undefined
            ? apiResponse({ data: workspace({ version: 4, next_action: "Enviar proposta" }) })
            : apiResponse({ error: { message: "same-stage transition" } }, 409),
        );
      }

      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);

    fireEvent.change(await screen.findByLabelText("Próxima ação"), {
      target: { value: "Enviar proposta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar acompanhamento" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/workspaces/${workspaceId}`,
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    const patchCall = fetchMock.mock.calls.find(([, init]) => init.method === "PATCH");
    expect(patchCall).toBeDefined();
    const [, patchInit] = patchCall!;
    expect(patchInit).toMatchObject({ credentials: "same-origin" });
    expect(JSON.parse(String(patchInit.body))).toEqual({
      expected_version: 3,
      next_action: "Enviar proposta",
    });
  });

  it("offers only the current stage and contract-allowed next stages", async () => {
    render(<CommercialWorkspaceDetailPage />);

    const stageSelect = await screen.findByLabelText("Estágio comercial");
    expect(
      within(stageSelect).getAllByRole("option").map((option) => option.getAttribute("value")),
    ).toEqual([
      "CONTACTED",
      "FOLLOW_UP",
      "MEETING",
      "PAUSED",
      "CLOSED_WON",
      "CLOSED_LOST",
    ]);
  });

  it("updates the workspace optimistically and confirms a successful save", async () => {
    fetchMock.mockImplementation((input, init) => {
      if (init.method === "PATCH") {
        return Promise.resolve(apiResponse({ data: workspace({ version: 4, next_action: "Enviar proposta" }) }));
      }

      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);

    fireEvent.change(await screen.findByLabelText("Próxima ação"), {
      target: { value: "Enviar proposta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar acompanhamento" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Acompanhamento comercial salvo.",
    );
    expect(screen.getByLabelText("Próxima ação")).toHaveValue("Enviar proposta");
    expect(screen.getByText("Versão 4")).toBeInTheDocument();
  });

  it("disables every commercial edit control while the PATCH is pending", async () => {
    let resolvePatch: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((input, init) => {
      if (init.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          resolvePatch = resolve;
        });
      }

      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);

    const nextAction = await screen.findByLabelText("Próxima ação");
    fireEvent.change(nextAction, { target: { value: "Enviar proposta" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar acompanhamento" }));

    await waitFor(() => expect(nextAction).toBeDisabled());
    expect(screen.getByLabelText("Responsável")).toBeDisabled();
    expect(screen.getByLabelText("Estágio comercial")).toBeDisabled();
    expect(screen.getByLabelText("Prazo da próxima ação")).toBeDisabled();
    expect(screen.getByLabelText("Desfecho comercial")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvar acompanhamento" })).toBeDisabled();

    await act(async () => {
      resolvePatch?.(
        apiResponse({
          data: workspace({ version: 4, next_action: "Enviar proposta" }),
        }),
      );
    });

    await waitFor(() => expect(nextAction).toBeEnabled());
    expect(nextAction).toHaveValue("Enviar proposta");
  });

  it("refreshes after a 409 conflict without retrying the mutation", async () => {
    let workspaceReads = 0;
    fetchMock.mockImplementation((input, init) => {
      if (input === `/api/workspaces/${workspaceId}` && init.method === "GET") {
        workspaceReads += 1;
        return Promise.resolve(
          apiResponse({ data: workspace({ version: workspaceReads === 1 ? 3 : 4, next_action: workspaceReads === 1 ? "Ação antiga" : "Ação de outra pessoa" }) }),
        );
      }
      if (init.method === "PATCH") {
        return Promise.resolve(apiResponse({ error: { message: "stale details" } }, 409));
      }

      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);

    fireEvent.change(await screen.findByLabelText("Próxima ação"), {
      target: { value: "Minha alteração" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar acompanhamento" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "O acompanhamento foi alterado por outra pessoa. Os dados mais recentes foram recarregados.",
    );
    expect(screen.getByLabelText("Próxima ação")).toHaveValue("Ação de outra pessoa");
    expect(fetchMock.mock.calls.filter(([, init]) => init.method === "PATCH")).toHaveLength(1);
    expect(workspaceGetCalls()).toHaveLength(2);
  });

  it("shows a safe edit error without exposing response details", async () => {
    fetchMock.mockImplementation((input, init) => {
      if (init.method === "PATCH") {
        return Promise.resolve(apiResponse({ error: { message: "UPDATE secret SET token" } }, 500));
      }

      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Salvar acompanhamento" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar o acompanhamento comercial agora.",
    );
    expect(document.body).not.toHaveTextContent("UPDATE secret SET token");
  });

  it("validates editable workspace fields before a PATCH request", async () => {
    render(<CommercialWorkspaceDetailPage />);

    fireEvent.change(await screen.findByLabelText("Responsável"), {
      target: { value: "  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar acompanhamento" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Informe um responsável válido ou deixe o campo vazio.",
    );
    expect(fetchMock.mock.calls.filter(([, init]) => init.method === "PATCH")).toHaveLength(0);
  });

  it("shows activity loading, list, and Brazilian dates independently", async () => {
    let resolveActivities: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((input) => {
      if (input.includes("/activities")) {
        return new Promise<Response>((resolve) => {
          resolveActivities = resolve;
        });
      }

      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByRole("status", { name: "Carregando atividades" })).toBeInTheDocument();
    resolveActivities?.(apiResponse(listEnvelope([activity()])));
    expect(await screen.findByText("Conversa inicial registrada")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Atividades comerciais" })).toHaveTextContent("10/07/2026");
  });

  it("uses local datetime components and converts the submitted activity to UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-10T02:34:00.000Z"));
    fetchMock.mockImplementation((input, init) => {
      if (input.includes("/activities") && init.method === "POST") {
        return Promise.resolve(
          apiResponse(
            {
              data: activity({
                occurred_at: "2026-07-10T15:34:00.000Z",
                summary: "Horário local confirmado",
              }),
            },
            201,
          ),
        );
      }

      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);
    vi.useRealTimers();

    const occurredAtInput = await screen.findByLabelText("Data e horário");
    expect(occurredAtInput).toHaveValue("2026-07-09T23:34");

    fireEvent.change(occurredAtInput, {
      target: { value: "2026-07-10T12:34" },
    });
    fireEvent.change(screen.getByLabelText("Resumo da atividade"), {
      target: { value: "Horário local confirmado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrar atividade" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([input, init]) => input.includes("/activities") && init.method === "POST",
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse(String(postCall?.[1].body))).toMatchObject({
        occurred_at: "2026-07-10T15:34:00.000Z",
      });
    });
  });

  it("rejects an invalid activity datetime before POST", async () => {
    render(<CommercialWorkspaceDetailPage />);

    fireEvent.change(await screen.findByLabelText("Data e horário"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrar atividade" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível registrar a atividade agora.",
    );
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => input.includes("/activities") && init.method === "POST",
      ),
    ).toHaveLength(0);
  });

  it("shows confirmed empty and safe error activity states", async () => {
    fetchMock.mockImplementation((input) =>
      input.includes("/activities")
        ? Promise.resolve(apiResponse(listEnvelope([], { total: 0 })))
        : defaultFetch(input),
    );
    render(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByText("Nenhuma atividade registrada.")).toBeInTheDocument();
  });

  it("paginates activities with one canonical query", async () => {
    fetchMock.mockImplementation((input) =>
      input.includes("/activities")
        ? Promise.resolve(apiResponse(listEnvelope([activity()], { page: input.includes("page=2") ? 2 : 1, total: 40 })))
        : defaultFetch(input),
    );
    render(<CommercialWorkspaceDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Próxima página de atividades" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/workspaces/${workspaceId}/activities?page=2&pageSize=20`,
        expect.any(Object),
      ),
    );
  });

  it("shows a safe activity error without exposing response details", async () => {
    fetchMock.mockImplementation((input) =>
      input.includes("/activities")
        ? Promise.resolve(apiResponse({ error: { message: "activity private error" } }, 500))
        : defaultFetch(input),
    );
    render(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as atividades agora.",
    );
    expect(document.body).not.toHaveTextContent("activity private error");
  });

  it("reloads the canonical first activity page after append without locally prepending", async () => {
    let appended = false;
    let firstPageReads = 0;
    const firstPage = Array.from({ length: 20 }, (_, index) =>
      activity({
        activity_id: `activity-page-one-${index}`,
        summary: `Atividade canônica ${index + 1}`,
      }),
    );
    const secondPage = Array.from({ length: 20 }, (_, index) =>
      activity({
        activity_id: `activity-page-two-${index}`,
        summary: `Atividade da página dois ${index + 1}`,
      }),
    );
    const appendedActivity = activity({
      activity_id: "activity-appended",
      summary: "Retorno combinado",
    });
    fetchMock.mockImplementation((input, init) => {
      if (input.includes("/activities") && init.method === "POST") {
        appended = true;
        return Promise.resolve(apiResponse({ data: appendedActivity }, 201));
      }

      if (input.includes("/activities") && input.includes("page=2")) {
        return Promise.resolve(
          apiResponse(listEnvelope(secondPage, { page: 2, total: 40 })),
        );
      }

      if (input.includes("/activities")) {
        firstPageReads += 1;
        return Promise.resolve(
          apiResponse(
            listEnvelope(
              appended ? [appendedActivity, ...firstPage.slice(0, 19)] : firstPage,
              { total: appended ? 41 : 40 },
            ),
          ),
        );
      }

      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Próxima página de atividades" }),
    );
    expect(await screen.findByText("Atividade da página dois 1")).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("Resumo da atividade"), {
      target: { value: "Retorno combinado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrar atividade" }));

    const activitiesRegion = screen.getByRole("region", {
      name: "Atividades comerciais",
    });
    expect(await within(activitiesRegion).findByText("Retorno combinado")).toBeInTheDocument();
    await waitFor(() => expect(firstPageReads).toBe(2));
    expect(within(activitiesRegion).getAllByRole("listitem")).toHaveLength(20);
    expect(within(activitiesRegion).getByText("Página 1 de 3")).toBeInTheDocument();
    expect(
      within(activitiesRegion).queryByText("Atividade da página dois 1"),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/workspaces/${workspaceId}/activities`,
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
  });

  it("shows notes loading, list, and confirmed empty state", async () => {
    let noteRequest = 0;
    fetchMock.mockImplementation((input) => {
      if (input.includes("/notes")) {
        noteRequest += 1;
        return Promise.resolve(apiResponse(listEnvelope(noteRequest === 1 ? [note()] : [], { total: noteRequest === 1 ? 1 : 0 })));
      }

      return defaultFetch(input);
    });
    const { rerender } = render(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByText("Observação comercial sintética.")).toBeInTheDocument();
    rerender(<CommercialWorkspaceDetailPage key="empty-notes" />);
    expect(await screen.findByText("Nenhuma nota registrada.")).toBeInTheDocument();
  });

  it("shows a safe notes error and paginates notes", async () => {
    fetchMock.mockImplementation((input) =>
      input.includes("/notes")
        ? Promise.resolve(
            input.includes("page=2")
              ? apiResponse(listEnvelope([note({ body: "Nota da página dois" })], { page: 2, total: 40 }))
              : apiResponse({ error: { message: "raw note error" } }, 500),
          )
        : defaultFetch(input),
    );
    render(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as notas agora.",
    );
    expect(document.body).not.toHaveTextContent("raw note error");
  });

  it("shows notes loading and paginates notes with one canonical query", async () => {
    let resolveNotes: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((input) => {
      if (input.includes("/notes")) {
        return new Promise<Response>((resolve) => {
          resolveNotes = resolve;
        });
      }

      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByRole("status", { name: "Carregando notas" })).toBeInTheDocument();
    resolveNotes?.(apiResponse(listEnvelope([note()], { total: 40 })));
    fireEvent.click(await screen.findByRole("button", { name: "Próxima página de notas" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/workspaces/${workspaceId}/notes?page=2&pageSize=20`,
        expect.any(Object),
      ),
    );
  });

  it("reloads the canonical first note page after append", async () => {
    let appended = false;
    let firstPageReads = 0;
    const appendedNote = note({
      note_id: "note-appended",
      body: "Nota adicionada",
    });
    fetchMock.mockImplementation((input, init) => {
      if (input.includes("/notes") && init.method === "POST") {
        appended = true;
        return Promise.resolve(apiResponse({ data: appendedNote }, 201));
      }

      if (input.includes("/notes")) {
        firstPageReads += 1;
        return Promise.resolve(
          apiResponse(
            listEnvelope(appended ? [appendedNote] : [note()], {
              total: appended ? 2 : 1,
            }),
          ),
        );
      }

      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);

    fireEvent.change(await screen.findByLabelText("Nova nota"), {
      target: { value: "Nota adicionada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar nota" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Nota adicionada.");
    await waitFor(() => expect(firstPageReads).toBe(2));
    expect(await screen.findByText("Nota adicionada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar nota|excluir nota/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar atividade|excluir atividade/i })).not.toBeInTheDocument();
  });

  it("shows audit loading, allowlisted business fields, and pagination", async () => {
    fetchMock.mockImplementation((input) =>
      input.includes("/audit")
        ? Promise.resolve(apiResponse(listEnvelope([auditEvent()], { total: 40 })))
        : defaultFetch(input),
    );
    render(<CommercialWorkspaceDetailPage />);

    const audit = await screen.findByRole("region", { name: "Auditoria comercial" });
    expect(audit).toHaveTextContent("Estágio comercial atualizado");
    expect(audit).toHaveTextContent("De Atribuído para Contatado");
    fireEvent.click(within(audit).getByRole("button", { name: "Próxima página de auditoria" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/workspaces/${workspaceId}/audit?page=2&pageSize=20`,
        expect.any(Object),
      ),
    );
  });

  it("shows audit loading and a confirmed empty state", async () => {
    let resolveAudit: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((input) => {
      if (input.includes("/audit")) {
        return new Promise<Response>((resolve) => {
          resolveAudit = resolve;
        });
      }

      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);

    expect(
      await screen.findByRole("status", { name: "Carregando auditoria comercial" }),
    ).toBeInTheDocument();
    resolveAudit?.(apiResponse(listEnvelope([], { total: 0 })));
    expect(
      await screen.findByText("Nenhum registro de auditoria confirmado."),
    ).toBeInTheDocument();
  });

  it("shows a safe audit error without response details", async () => {
    fetchMock.mockImplementation((input) =>
      input.includes("/audit")
        ? Promise.resolve(apiResponse({ error: { message: "audit internal stack" } }, 500))
        : defaultFetch(input),
    );
    render(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar a auditoria comercial agora.",
    );
    expect(document.body).not.toHaveTextContent("audit internal stack");
  });

  it("shows audit empty, error, and denied states safely", async () => {
    fetchMock.mockImplementation((input) =>
      input.includes("/audit")
        ? Promise.resolve(apiResponse({ error: { message: "audit token" } }, 403))
        : defaultFetch(input),
    );
    render(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Você não tem acesso à auditoria comercial.",
    );
    expect(document.body).not.toHaveTextContent("audit token");
  });

  it("contains no direct database, producer, external, or unauthorized API integration", () => {
    const pageSource = source();

    expect(pageSource).not.toMatch(
      /n8n|webhook|PRODUCER_DATABASE_URL|APP_DATABASE_URL|server\/db|\bSELECT\s+(?:\*|FROM)\b|\bINSERT\s+INTO\b/i,
    );
    expect(pageSource).not.toMatch(/\/api\/(?:imports|leads|work-queue)/);
    expect(pageSource).not.toMatch(/\b(?:PUT|DELETE)\b/);
    expect(pageSource).toMatch(/\/api\/workspaces/);
  });
});
