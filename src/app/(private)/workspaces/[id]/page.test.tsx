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
  QualificationCadenceDto,
} from "../../../../types/commercial";

const { navigationState } = vi.hoisted(() => ({
  navigationState: {
    workspaceId: "00000000-0000-4000-8000-000000000041",
    query: "",
  },
}));

const { permissionState } = vi.hoisted(() => ({
  permissionState: {
    permissions: new Set(["commercial:read", "commercial:write", "commercial:assign", "audit:read"]),
  },
}));

vi.mock("../../../../components/auth/private-capabilities", () => ({
  usePrivateCapabilities: () => ({
    hasPermission: (permission: string) =>
      permissionState.permissions.has(permission),
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: navigationState.workspaceId }),
  useSearchParams: () => new URLSearchParams(navigationState.query),
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

function qualificationCadence(recorded = false): QualificationCadenceDto {
  return {
    status: recorded ? "QUALIFIED" : "ACTIVE",
    current_contact_number: recorded ? null : 1,
    contacts: ([1, 2, 3, 4] as const).map((contactNumber) => ({
      qualification_contact_id: `00000000-0000-4000-8000-00000000075${contactNumber}`,
      contact_number: contactNumber,
      scheduled_at: `2026-08-${String(10 + contactNumber).padStart(2, "0")}T12:00:00.000Z`,
      state: recorded ? (contactNumber === 1 ? "COMPLETED" : "CANCELLED") : "PENDING",
      outcome: recorded && contactNumber === 1 ? "QUALIFIED" : null,
      channel: recorded && contactNumber === 1 ? "CALL" : null,
      summary: null,
      completed_at: recorded && contactNumber === 1 ? "2026-08-11T15:00:00.000Z" : null,
    })),
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

  if (input.includes("/qualification-cadence")) {
    return Promise.resolve(
      apiResponse({
        data: {
          status: "NOT_STARTED",
          current_contact_number: null,
          contacts: [],
        },
      }),
    );
  }

  if (input.includes("/approach-message")) {
    return Promise.resolve(
      apiResponse({ data: { status: "missing", message: null } }),
    );
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
    permissionState.permissions = new Set([
      "commercial:read",
      "commercial:write",
      "commercial:assign",
      "audit:read",
    ]);
  navigationState.workspaceId = workspaceId;
  navigationState.query = "";
  fetchMock.mockReset();
  fetchMock.mockImplementation((input) => defaultFetch(input));
  vi.stubGlobal("fetch", fetchMock);
});

describe("commercial workspace detail page", () => {
  it("requires independent commercial read access before any private API query", async () => {
    permissionState.permissions = new Set(["commercial:write", "audit:read", "leads:read", "sensitive:read"]);
    render(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByText("Você não tem acesso a este acompanhamento comercial.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Próxima ação")).not.toBeInTheDocument();
  });

  it("does not query or show audit facts without the independent audit permission", async () => {
    permissionState.permissions.delete("audit:read");
    render(<CommercialWorkspaceDetailPage />);

    await screen.findByLabelText("Próxima ação");
    expect(await screen.findByText("Você não tem acesso à auditoria comercial.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => input.includes("/audit"))).toBe(false);
    expect(document.body).not.toHaveTextContent("Estágio comercial atualizado");
  });

  it("hides previously loaded private data and stops queries when commercial read access is removed", async () => {
    const rendered = render(<CommercialWorkspaceDetailPage />);
    await screen.findByLabelText("Próxima ação");
    await screen.findByText("Observação comercial sintética.");
    const previousReads = fetchMock.mock.calls.length;
    permissionState.permissions.delete("commercial:read");
    rendered.rerender(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByText("Você não tem acesso a este acompanhamento comercial.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Próxima ação")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Observação comercial sintética.");
    expect(fetchMock).toHaveBeenCalledTimes(previousReads);
  });

  it("hides previously loaded audit facts without querying when audit read access is removed", async () => {
    const rendered = render(<CommercialWorkspaceDetailPage />);
    await screen.findByText("Estágio comercial atualizado");
    const previousAuditReads = fetchMock.mock.calls.filter(([input]) => input.includes("/audit")).length;
    permissionState.permissions.delete("audit:read");
    rendered.rerender(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByText("Você não tem acesso à auditoria comercial.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Estágio comercial atualizado");
    expect(fetchMock.mock.calls.filter(([input]) => input.includes("/audit"))).toHaveLength(previousAuditReads);
    expect(screen.getByLabelText("Próxima ação")).toBeInTheDocument();
  });

  it.each(["workspace", "activity", "note"] as const)(
    "stops displaying private data and requesting it after a %s mutation returns 401",
    async (kind) => {
      fetchMock.mockImplementation((input, init) => init.method === "PATCH" || init.method === "POST"
        ? Promise.resolve(apiResponse({ error: { message: "expired private session" } }, 401))
        : defaultFetch(input));
      const rendered = render(<CommercialWorkspaceDetailPage />);
      await screen.findByText("Observação comercial sintética.");
      if (kind === "workspace") {
        fireEvent.change(screen.getByLabelText("Próxima ação"), { target: { value: "Ação que não será salva" } });
        fireEvent.click(screen.getByRole("button", { name: "Salvar acompanhamento" }));
      } else if (kind === "activity") {
        fireEvent.click(screen.getByRole("button", { name: "Registrar atividade" }));
      } else {
        fireEvent.change(screen.getByLabelText("Nova nota"), { target: { value: "Nota que não será salva" } });
        fireEvent.click(screen.getByRole("button", { name: "Adicionar nota" }));
      }

      expect(await screen.findByText("Entre para acessar este acompanhamento comercial.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Entrar novamente" })).toHaveAttribute("href", "/login");
      expect(screen.queryByLabelText("Próxima ação")).not.toBeInTheDocument();
      expect(document.body).not.toHaveTextContent("Observação comercial sintética.");
      expect(document.body).not.toHaveTextContent("expired private session");
      const callsAfterDenial = fetchMock.mock.calls.length;
      navigationState.workspaceId = otherWorkspaceId;
      rendered.rerender(<CommercialWorkspaceDetailPage />);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
      expect(fetchMock).toHaveBeenCalledTimes(callsAfterDenial);
    },
  );

  it.each([200, 403] as const)("revalidates commercial read access after PATCH 403; GET result %s", async (readStatus) => {
    let mutationDenied = false;
    fetchMock.mockImplementation((input, init) => {
      if (init.method === "PATCH") {
        mutationDenied = true;
        return Promise.resolve(apiResponse({ error: { message: "private permission details" } }, 403));
      }
      if (input === `/api/workspaces/${workspaceId}` && mutationDenied && readStatus === 403) {
        return Promise.resolve(apiResponse({ error: { message: "private read denial" } }, 403));
      }
      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);
    fireEvent.change(await screen.findByLabelText("Próxima ação"), { target: { value: "Ação não confirmada" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar acompanhamento" }));

    if (readStatus === 200) {
      expect(await screen.findByText(/Você não tem acesso para salvar este acompanhamento comercial\./)).toBeInTheDocument();
      expect(screen.getByLabelText("Próxima ação")).toHaveValue("Ação não confirmada");
      expect(screen.getByText("Estágio: Contatado")).toBeInTheDocument();
    } else {
      expect(await screen.findByText("Você não tem acesso a este acompanhamento comercial.")).toBeInTheDocument();
      expect(screen.queryByLabelText("Próxima ação")).not.toBeInTheDocument();
    }
    expect(workspaceGetCalls()).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([, init]) => init.method === "PATCH")).toHaveLength(1);
    expect(document.body).not.toHaveTextContent("private permission details");
  });

  it.each(["activities", "notes", "audit"] as const)("stops the private workspace when the %s GET loses the session", async (panel) => {
    let resolvePanel: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((input) => input.includes(`/${panel}`)
      ? new Promise<Response>((resolve) => { resolvePanel = resolve; })
      : defaultFetch(input));
    render(<CommercialWorkspaceDetailPage />);
    await screen.findByLabelText("Próxima ação");
    await act(async () => { resolvePanel?.(apiResponse({ error: { message: "private expired session" } }, 401)); });

    expect(await screen.findByText("Entre para acessar este acompanhamento comercial.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Próxima ação")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private expired session");
  });

  it.each(["GET", "POST"] as const)("stops the private workspace when cadence %s loses the session", async (method) => {
    fetchMock.mockImplementation((input, init) => input.includes("/qualification-cadence") && init.method === method
      ? Promise.resolve(apiResponse({ error: { message: "private cadence session" } }, 401))
      : defaultFetch(input));
    render(<CommercialWorkspaceDetailPage />);
    if (method === "POST") {
      fireEvent.click(await screen.findByRole("button", { name: "Criar plano de 4 contatos" }));
    }

    expect(await screen.findByText("Entre para acessar este acompanhamento comercial.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Próxima ação")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private cadence session");
  });

  it("stops the private workspace when the persisted approach query loses the session", async () => {
    permissionState.permissions.add("leads:read");
    permissionState.permissions.add("sensitive:read");
    fetchMock.mockImplementation((input) => input.includes("/approach-message")
      ? Promise.resolve(apiResponse({ error: { message: "private approach session" } }, 401))
      : defaultFetch(input));
    render(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByText("Entre para acessar este acompanhamento comercial.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Próxima ação")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private approach session");
  });

  it("renders the workspace as a private business page", async () => {
    render(<CommercialWorkspaceDetailPage />);

    expect(
      await screen.findByRole("heading", { name: "Acompanhamento comercial" }),
    ).toBeInTheDocument();
    expect(screen.getByText("CNPJ 12.345.678/0001-95")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar para leads" })).toHaveAttribute(
      "href",
      "/leads?cnpj=12345678000195",
    );
    expect(screen.getByRole("link", { name: "Ver avaliação da empresa" })).toHaveAttribute(
      "href",
      `/leads/12345678000195?leadRunId=${encodeURIComponent(leadRunId)}&returnTo=%2Fworkspaces%2F00000000-0000-4000-8000-000000000041%3FreturnTo%3D%252Fleads%253Fcnpj%253D12345678000195`,
    );
  });

  it("returns to the approved lead list context and exposes direct task shortcuts", async () => {
    const queueReturn = "/work-queue?page=3&pageSize=10&priority=C";
    permissionState.permissions = new Set([
      "commercial:read",
      "commercial:write",
      "commercial:assign",
      "leads:read",
      "sensitive:read",
    ]);
    navigationState.query = `returnTo=${encodeURIComponent(queueReturn)}`;
    render(<CommercialWorkspaceDetailPage />);

    await screen.findByRole("heading", { name: "Acompanhamento comercial" });
    expect(
      screen.getByRole("link", { name: "Voltar para leads" }),
    ).toHaveAttribute("href", "/leads?page=3&pageSize=10&priority=C");

    const shortcuts = screen.getByRole("navigation", {
      name: "Atalhos do acompanhamento",
    });
    for (const [label, href] of [
      ["Atualizar estado comercial", "#workspace-state"],
      ["Revisar mensagem", "#workspace-approach"],
      ["Plano de contatos", "#qualification-cadence"],
      ["Registrar atividade", "#commercial-activities"],
      ["Adicionar nota", "#commercial-notes"],
    ]) {
      expect(within(shortcuts).getByRole("link", { name: label })).toHaveAttribute(
        "href",
        href,
      );
    }
  });

  it("warns before abandoning changed work and can discard workspace edits", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CommercialWorkspaceDetailPage />);

    const nextAction = await screen.findByLabelText("Próxima ação");
    fireEvent.change(nextAction, { target: { value: "Enviar proposta revisada" } });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Alterações não salvas.",
    );
    fireEvent.click(screen.getByRole("link", { name: "Voltar para leads" }));
    expect(confirmSpy).toHaveBeenCalledWith(
      "Há alterações não salvas neste acompanhamento. Deseja sair mesmo assim?",
    );

    const externalLink = document.createElement("a");
    externalLink.href = `https://external.example${window.location.pathname}${window.location.search}`;
    externalLink.textContent = "Sair do Prospecta";
    document.body.append(externalLink);
    fireEvent.click(externalLink);
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    externalLink.remove();

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    expect(window.dispatchEvent(beforeUnload)).toBe(false);
    expect(beforeUnload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Descartar alterações" }));
    expect(nextAction).toHaveValue("Ligar para o financeiro");
    expect(screen.queryByText("Alterações não salvas.")).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("shows the same persisted approach message to authorized lead readers", async () => {
    const message =
      "Mensagem persistida que também está disponível no lead e na fila comercial.";
    permissionState.permissions = new Set([
      "commercial:read",
      "commercial:write",
      "commercial:assign",
      "leads:read",
      "sensitive:read",
    ]);
    fetchMock.mockImplementation((input) =>
      input.includes("/approach-message")
        ? Promise.resolve(apiResponse({ data: { status: "ready", message } }))
        : defaultFetch(input),
    );

    render(<CommercialWorkspaceDetailPage />);

    expect(
      await screen.findByRole("textbox", { name: "Mensagem de abordagem" }),
    ).toHaveValue(message);
  });

  it("presents a read-only workspace without unusable mutation controls", async () => {
    permissionState.permissions = new Set(["commercial:read"]);
    render(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByLabelText("Responsável")).toBeDisabled();
    expect(screen.getByLabelText("Estágio comercial")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hoje" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Amanhã" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Em 7 dias" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Registrar atividade" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar nota" })).not.toBeInTheDocument();
    expect(document.body).toHaveTextContent("Este acompanhamento está disponível somente para leitura");
  });

  it("keeps assignment independent from other commercial edits", async () => {
    permissionState.permissions = new Set(["commercial:read", "commercial:write"]);
    render(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByLabelText("Responsável")).toBeDisabled();
    expect(screen.getByLabelText("Estágio comercial")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Registrar atividade" })).toBeInTheDocument();
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
    await screen.findByRole("button", { name: "Criar plano de 4 contatos" });
    expect(fetchMock.mock.calls.map(([input]) => input)).toEqual([
      `/api/workspaces/${workspaceId}`,
      `/api/workspaces/${workspaceId}/activities?page=1&pageSize=20`,
      `/api/workspaces/${workspaceId}/notes?page=1&pageSize=20`,
      `/api/workspaces/${workspaceId}/audit?page=1&pageSize=20`,
      `/api/workspaces/${workspaceId}/qualification-cadence`,
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
    }
  });

  it("shows the four-contact qualification cadence and refreshes workspace, activity and audit after a change", async () => {
    let activityReads = 0;
    let auditReads = 0;
    fetchMock.mockImplementation((input, init) => {
      if (input.includes("/activities")) {
        activityReads += 1;
        return Promise.resolve(apiResponse(listEnvelope([activity()])));
      }

      if (input.includes("/audit")) {
        auditReads += 1;
        return Promise.resolve(apiResponse(listEnvelope([auditEvent()])));
      }

      if (input.includes("/qualification-cadence") && init.method === "POST") {
        return Promise.resolve(
          apiResponse(
            {
              data: {
                status: "ACTIVE",
                current_contact_number: 1,
                contacts: [1, 2, 3, 4].map((contactNumber) => ({
                  qualification_contact_id: `00000000-0000-4000-8000-00000000075${contactNumber}`,
                  contact_number: contactNumber,
                  scheduled_at: `2026-08-${String(10 + contactNumber).padStart(2, "0")}T12:00:00.000Z`,
                  state: "PENDING",
                  outcome: null,
                  channel: null,
                  summary: null,
                  completed_at: null,
                })),
              },
              meta: { result: "started" },
            },
            201,
          ),
        );
      }

      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);

    expect(
      await screen.findByRole("heading", { name: "Plano de contatos" }),
    ).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("Data do 1º contato"), {
      target: { value: "2026-08-11" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Criar plano de 4 contatos" }),
    );

    expect(await screen.findAllByText(/Contato de qualificação/)).toHaveLength(4);
    await waitFor(() => {
      expect(activityReads).toBe(2);
      expect(auditReads).toBe(2);
      expect(workspaceGetCalls()).toHaveLength(2);
    });
  });

  it("refreshes the canonical stage after qualification while preserving only edited workspace fields", async () => {
    let recorded = false;
    fetchMock.mockImplementation((input, init) => {
      if (input.includes("/qualification-cadence")) {
        if (init.method === "POST") {
          recorded = true;
          return Promise.resolve(apiResponse({
            data: qualificationCadence(true),
            meta: { result: "recorded", pipelineAction: { kind: "automatic", commercial_stage: "MEETING" } },
          }));
        }
        return Promise.resolve(apiResponse({ data: qualificationCadence() }));
      }
      if (input === `/api/workspaces/${workspaceId}`) {
        return Promise.resolve(apiResponse({ data: workspace(recorded ? {
          commercial_stage: "MEETING",
          next_action: "Agendar reunião de diagnóstico",
          next_action_due_at: null,
          version: 4,
        } : {}) }));
      }
      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);

    fireEvent.change(await screen.findByLabelText("Responsável"), {
      target: { value: "oidc|synthetic-new-responsible" },
    });
    fireEvent.change(screen.getByLabelText("Nova nota"), {
      target: { value: "Nota ainda não salva" },
    });
    fireEvent.change(await screen.findByLabelText("O que aconteceu?"), {
      target: { value: "QUALIFIED" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrar 1º contato" }));

    expect(await screen.findByText("Estágio: Reunião")).toBeInTheDocument();
    expect(screen.getByLabelText("Estágio comercial")).toHaveValue("MEETING");
    expect(screen.getByLabelText("Próxima ação")).toHaveValue("Agendar reunião de diagnóstico");
    expect(screen.getByLabelText("Responsável")).toHaveValue("oidc|synthetic-new-responsible");
    expect(screen.getByLabelText("Nova nota")).toHaveValue("Nota ainda não salva");

    fireEvent.click(screen.getByRole("button", { name: "Salvar acompanhamento" }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init.method === "PATCH");
      expect(JSON.parse(String(patch?.[1].body))).toEqual({
        expected_version: 4,
        responsible_subject: "oidc|synthetic-new-responsible",
      });
    });
  });

  it("retains workspace and local drafts when the post-qualification refresh fails", async () => {
    let recorded = false;
    let refreshUnavailable = true;
    fetchMock.mockImplementation((input, init) => {
      if (input.includes("/qualification-cadence")) {
        if (init.method === "POST") {
          recorded = true;
          return Promise.resolve(apiResponse({
            data: qualificationCadence(true),
            meta: { result: "recorded", pipelineAction: { kind: "automatic", commercial_stage: "MEETING" } },
          }));
        }
        return Promise.resolve(apiResponse({ data: qualificationCadence() }));
      }
      if (input === `/api/workspaces/${workspaceId}` && recorded) {
        return Promise.resolve(refreshUnavailable
          ? apiResponse({ error: { message: "private database detail" } }, 503)
          : apiResponse({ data: workspace({ commercial_stage: "MEETING", version: 4 }) }));
      }
      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);

    fireEvent.change(await screen.findByLabelText("Próxima ação"), {
      target: { value: "Ação ainda não salva" },
    });
    fireEvent.change(await screen.findByLabelText("O que aconteceu?"), {
      target: { value: "QUALIFIED" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrar 1º contato" }));

    expect(await screen.findByText("Não foi possível atualizar o acompanhamento. Seus rascunhos foram preservados.")).toBeInTheDocument();
    expect(screen.getByLabelText("Próxima ação")).toHaveValue("Ação ainda não salva");
    expect(screen.getByText("Estágio: Contatado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar acompanhamento" })).toBeDisabled();
    expect(document.body).not.toHaveTextContent("private database detail");

    refreshUnavailable = false;
    fireEvent.click(screen.getByRole("button", { name: "Atualizar acompanhamento" }));
    expect(await screen.findByText("Estágio: Reunião")).toBeInTheDocument();
    expect(screen.getByLabelText("Próxima ação")).toHaveValue("Ação ainda não salva");
    expect(screen.getByRole("button", { name: "Salvar acompanhamento" })).not.toBeDisabled();
    expect(fetchMock.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
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

  it("ignores an old canonical cadence refresh after the route changes", async () => {
    let resolveRefresh: ((response: Response) => void) | undefined;
    let mainReads = 0;
    fetchMock.mockImplementation((input, init) => {
      if (input === `/api/workspaces/${workspaceId}`) {
        mainReads += 1;
        if (mainReads === 2) return new Promise<Response>((resolve) => { resolveRefresh = resolve; });
      }
      if (input === `/api/workspaces/${otherWorkspaceId}`) {
        return Promise.resolve(apiResponse({ data: workspace({
          workspace_id: otherWorkspaceId, cnpj_normalizado: "99888777000166", next_action: "Ação da outra empresa",
        }) }));
      }
      if (input.includes("/qualification-cadence") && init.method === "POST") {
        return Promise.resolve(apiResponse({ data: qualificationCadence(true), meta: {
          result: "recorded", pipelineAction: { kind: "automatic", commercial_stage: "MEETING" },
        } }));
      }
      if (input.includes("/qualification-cadence")) return Promise.resolve(apiResponse({ data: qualificationCadence() }));
      return defaultFetch(input);
    });
    const rendered = render(<CommercialWorkspaceDetailPage />);
    fireEvent.change(await screen.findByLabelText("O que aconteceu?"), { target: { value: "QUALIFIED" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar 1º contato" }));
    await waitFor(() => expect(mainReads).toBe(2));

    navigationState.workspaceId = otherWorkspaceId;
    rendered.rerender(<CommercialWorkspaceDetailPage />);
    await screen.findByText("CNPJ 99.888.777/0001-66");
    await act(async () => { resolveRefresh?.(apiResponse({ data: workspace({ commercial_stage: "MEETING", version: 4 }) })); });

    expect(screen.getByText("CNPJ 99.888.777/0001-66")).toBeInTheDocument();
    expect(screen.getByLabelText("Próxima ação")).toHaveValue("Ação da outra empresa");
    expect(screen.queryByText("CNPJ 12.345.678/0001-95")).not.toBeInTheDocument();
  });

  it("keeps the latest canonical workspace when cadence refreshes resolve out of order", async () => {
    let resolveOlderRefresh: ((response: Response) => void) | undefined;
    let mainReads = 0;
    let contactWrites = 0;
    fetchMock.mockImplementation((input, init) => {
      if (input === `/api/workspaces/${workspaceId}`) {
        mainReads += 1;
        if (mainReads === 2) return new Promise<Response>((resolve) => { resolveOlderRefresh = resolve; });
        if (mainReads === 3) return Promise.resolve(apiResponse({ data: workspace({
          commercial_stage: "MEETING", next_action: "Agendar reunião de diagnóstico", version: 5,
        }) }));
      }
      if (input.includes("/qualification-cadence") && init.method === "POST") {
        contactWrites += 1;
        const afterFirst: QualificationCadenceDto = {
          ...qualificationCadence(),
          current_contact_number: 2,
          contacts: qualificationCadence().contacts.map((contact) => contact.contact_number === 1
            ? { ...contact, state: "COMPLETED", outcome: "RESPONDED", channel: "CALL", completed_at: "2026-08-11T15:00:00.000Z" }
            : contact),
        };
        return Promise.resolve(apiResponse({
          data: contactWrites === 1 ? afterFirst : qualificationCadence(true),
          meta: { result: "recorded", pipelineAction: contactWrites === 1
            ? { kind: "recommendation", commercial_stage: null }
            : { kind: "automatic", commercial_stage: "MEETING" } },
        }));
      }
      if (input.includes("/qualification-cadence")) return Promise.resolve(apiResponse({ data: qualificationCadence() }));
      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);
    fireEvent.change(await screen.findByLabelText("O que aconteceu?"), { target: { value: "RESPONDED" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar 1º contato" }));
    await waitFor(() => expect(mainReads).toBe(2));
    fireEvent.change(await screen.findByLabelText("O que aconteceu?"), { target: { value: "QUALIFIED" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar 2º contato" }));
    await screen.findByText("Versão 5");
    await act(async () => { resolveOlderRefresh?.(apiResponse({ data: workspace({
      next_action: "Revisar a resposta e confirmar a próxima etapa", version: 4,
    }) })); });

    expect(screen.getByText("Versão 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Estágio comercial")).toHaveValue("MEETING");
    expect(screen.getByLabelText("Próxima ação")).toHaveValue("Agendar reunião de diagnóstico");
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
      "As alterações aqui afetam somente o acompanhamento comercial. A recomendação da análise permanece a mesma.",
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

  it("loads a non-noon deadline using its São Paulo date without creating unsaved changes", async () => {
    fetchMock.mockImplementation((input) =>
      input === `/api/workspaces/${workspaceId}`
        ? Promise.resolve(apiResponse({ data: workspace({ next_action_due_at: "2026-10-07T01:30:00.000Z" }) }))
        : defaultFetch(input),
    );
    render(<CommercialWorkspaceDetailPage />);

    expect(await screen.findByLabelText("Prazo da próxima ação")).toHaveValue("2026-10-06");
    expect(document.body).toHaveTextContent("Prazo: 06/10/2026");
    expect(screen.getByRole("button", { name: "Salvar acompanhamento" })).toBeDisabled();
    expect(screen.queryByText("Alterações não salvas.")).not.toBeInTheDocument();
  });

  it.each([
    { field: "Próxima ação", value: "Enviar proposta", expected: { next_action: "Enviar proposta" } },
    { field: "Estágio comercial", value: "FOLLOW_UP", expected: { commercial_stage: "FOLLOW_UP" } },
  ] as const)("preserves the exact non-noon deadline while changing $field", async ({ field, value, expected }) => {
    const persistedDueAt = "2026-10-07T01:30:00.000Z";
    fetchMock.mockImplementation((input, init) => {
      if (input === `/api/workspaces/${workspaceId}`) {
        return Promise.resolve(apiResponse({ data: workspace({
          next_action_due_at: persistedDueAt,
          ...(init.method === "PATCH" ? { ...expected, version: 4 } : {}),
        }) }));
      }
      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);

    fireEvent.change(await screen.findByLabelText(field), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar acompanhamento" }));

    await screen.findByText("Acompanhamento comercial salvo.");
    const patch = fetchMock.mock.calls.find(([, init]) => init.method === "PATCH")!;
    expect(JSON.parse(String(patch[1].body))).toEqual({ expected_version: 3, ...expected });
    expect(screen.getByLabelText("Prazo da próxima ação")).toHaveValue("2026-10-06");
    expect(screen.getByRole("button", { name: "Salvar acompanhamento" })).toBeDisabled();
  });

  it("changes only the protected due-date draft through quick scheduling and saves once explicitly", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-12T01:30:00.000Z"));
    fetchMock.mockImplementation((input, init) =>
      init.method === "PATCH"
        ? Promise.resolve(apiResponse({ data: workspace({ version: 4, next_action_due_at: "2026-07-18T12:00:00.000Z" }) }))
        : input === `/api/workspaces/${workspaceId}`
          ? Promise.resolve(apiResponse({ data: workspace({ next_action_due_at: "2026-07-12T01:30:00.000Z" }) }))
          : defaultFetch(input),
    );

    try {
      render(<CommercialWorkspaceDetailPage />);
      const deadline = await screen.findByLabelText("Prazo da próxima ação");
      const shortcuts = screen.getByRole("group", { name: "Atalhos para o prazo da próxima ação" });

      fireEvent.click(within(shortcuts).getByRole("button", { name: "Amanhã" }));
      expect(deadline).toHaveValue("2026-07-12");
      fireEvent.click(within(shortcuts).getByRole("button", { name: "Hoje" }));
      expect(deadline).toHaveValue("2026-07-11");
      expect(screen.getByRole("button", { name: "Salvar acompanhamento" })).toBeDisabled();
      fireEvent.click(within(shortcuts).getByRole("button", { name: "Em 7 dias" }));
      expect(deadline).toHaveValue("2026-07-18");
      expect(fetchMock.mock.calls.filter(([, init]) => init.method === "PATCH")).toHaveLength(0);
      expect(document.body).toHaveTextContent("Alterações não salvas");

      fireEvent.click(screen.getByRole("button", { name: "Salvar acompanhamento" }));
      await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init.method === "PATCH")).toHaveLength(1));
      const patch = fetchMock.mock.calls.find(([, init]) => init.method === "PATCH")!;
      expect(JSON.parse(String(patch[1].body))).toEqual({
        expected_version: 3,
        next_action_due_at: "2026-07-18T12:00:00.000Z",
      });
      await screen.findByText("Acompanhamento comercial salvo.");
    } finally {
      vi.useRealTimers();
    }
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

    expect(await screen.findByText("Acompanhamento comercial salvo.")).toHaveAttribute("role", "status");
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
    expect(screen.getByRole("button", { name: "Hoje" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Amanhã" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Em 7 dias" })).toBeDisabled();
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
      "O acompanhamento foi alterado por outra pessoa. Seu rascunho foi preservado; consulte os dados atuais e revise as alterações antes de salvar.",
    );
    expect(screen.getByLabelText("Próxima ação")).toHaveValue("Minha alteração");
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

    fireEvent.change(await screen.findByLabelText("Próxima ação"), {
      target: { value: "Uma alteração sintética" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Salvar acompanhamento" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível confirmar o resultado desta ação.",
    );
    expect(document.body).not.toHaveTextContent("UPDATE secret SET token");
  });

  it("does not submit or audit an unchanged commercial workspace", async () => {
    render(<CommercialWorkspaceDetailPage />);

    const saveButton = await screen.findByRole("button", {
      name: "Salvar acompanhamento",
    });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);

    expect(
      fetchMock.mock.calls.filter(([, init]) => init.method === "PATCH"),
    ).toHaveLength(0);
  });

  it.each(["workspace", "activity", "note"] as const)(
    "refreshes canonical audit history after a confirmed %s write",
    async (kind) => {
      let saved = false;
      const newAudit = auditEvent({
        action: kind === "workspace" ? "NEXT_ACTION_CHANGED" : kind === "activity" ? "ACTIVITY_APPENDED" : "NOTE_APPENDED",
      });
      fetchMock.mockImplementation((input, init) => {
        if (input.includes("/audit")) {
          return Promise.resolve(apiResponse(listEnvelope(saved ? [newAudit] : [])));
        }
        if (init.method === "PATCH" || init.method === "POST") {
          saved = true;
          return Promise.resolve(apiResponse({ data:
            kind === "workspace" ? workspace({ next_action: "Ação confirmada", version: 4 }) :
              kind === "activity" ? activity() : note(),
          }, kind === "workspace" ? 200 : 201));
        }
        return defaultFetch(input);
      });
      render(<CommercialWorkspaceDetailPage />);

      await screen.findByText("Nenhum registro de auditoria confirmado.");
      if (kind === "workspace") {
        fireEvent.change(screen.getByLabelText("Próxima ação"), { target: { value: "Ação confirmada" } });
        fireEvent.click(screen.getByRole("button", { name: "Salvar acompanhamento" }));
      } else if (kind === "activity") {
        fireEvent.click(screen.getByRole("button", { name: "Registrar atividade" }));
      } else {
        fireEvent.change(screen.getByLabelText("Nova nota"), { target: { value: "Nota confirmada" } });
        fireEvent.click(screen.getByRole("button", { name: "Adicionar nota" }));
      }

      await waitFor(() => {
        expect(fetchMock.mock.calls.filter(([input]) => input.includes("/audit"))).toHaveLength(2);
      });
      expect(screen.queryByText("Nenhum registro de auditoria confirmado.")).not.toBeInTheDocument();
      expect(fetchMock.mock.calls.filter(([, init]) => init.method === "PATCH" || init.method === "POST")).toHaveLength(1);
    },
  );

  it("validates editable workspace fields before a PATCH request", async () => {
    render(<CommercialWorkspaceDetailPage />);

    fireEvent.change(await screen.findByLabelText("Responsável"), {
      target: { value: "  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar acompanhamento" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Informe um responsável válido, com até 256 caracteres, ou deixe o campo vazio.",
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
      "Informe uma data e horário válidos, um resultado de até 120 caracteres e um resumo de até 1.000 caracteres.",
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

  it("keeps an empty note from becoming a failing API action", async () => {
    render(<CommercialWorkspaceDetailPage />);

    const addNote = await screen.findByRole("button", { name: "Adicionar nota" });
    expect(addNote).toBeDisabled();
    expect(screen.getByLabelText("Nova nota")).toBeRequired();
    fireEvent.click(addNote);
    expect(
      fetchMock.mock.calls.filter(([input, init]) =>
        input.includes("/notes") && init.method === "POST",
      ),
    ).toHaveLength(0);
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

describe("commercial mutation feedback and recovery", () => {
  it.each([
    ["activities", "Resumo da atividade", "Registrar atividade", "Registrando atividade…"],
    ["notes", "Nova nota", "Adicionar nota", "Adicionando nota…"],
  ] as const)("guards duplicate %s submissions and announces the pending operation", async (endpoint, fieldLabel, buttonLabel, pendingLabel) => {
    let finish: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((input, init) => input.endsWith(`/${endpoint}`) && init.method === "POST"
      ? new Promise<Response>((resolve) => { finish = resolve; })
      : defaultFetch(input));
    render(<CommercialWorkspaceDetailPage />);
    fireEvent.change(await screen.findByLabelText(fieldLabel), { target: { value: "Rascunho sintético preservado" } });
    const form = screen.getByRole("button", { name: buttonLabel }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);
    expect(fetchMock.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(pendingLabel);
    expect(screen.getByLabelText(fieldLabel)).toBeDisabled();
    await act(async () => { finish?.(apiResponse({ data: { invalid: true } }, 201)); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível confirmar o resultado desta ação.");
    expect(screen.getByLabelText(fieldLabel)).toHaveValue("Rascunho sintético preservado");
  });

  it.each(["network", "invalid-json", "wrong-workspace"] as const)("preserves the note and blocks replay after %s", async (failure) => {
    fetchMock.mockImplementation((input, init) => {
      if (input.endsWith("/notes") && init.method === "POST") {
        if (failure === "network") return Promise.reject(new Error("private network address"));
        if (failure === "invalid-json") return Promise.resolve(new Response("not-json", { status: 201 }));
        return Promise.resolve(apiResponse({ data: note({ workspace_id: otherWorkspaceId }) }, 201));
      }
      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);
    fireEvent.change(await screen.findByLabelText("Nova nota"), { target: { value: "Anotação sintética preservada" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar nota" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível confirmar o resultado desta ação.");
    expect(screen.getByLabelText("Nova nota")).toHaveValue("Anotação sintética preservada");
    expect(screen.getByRole("button", { name: "Adicionar nota" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Conferi o histórico; preparar novo registro" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Consultar notas registradas" }));
    expect(await screen.findByRole("button", { name: "Conferi o histórico; preparar novo registro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar nota" })).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
    expect(document.body).not.toHaveTextContent("private network address");
    fireEvent.click(screen.getByRole("button", { name: "Conferi o histórico; preparar novo registro" }));
    expect(screen.getByRole("button", { name: "Adicionar nota" })).toBeEnabled();
    expect(fetchMock.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
  });

  it("preserves workspace fields when a save response cannot be validated and recovers with GET", async () => {
    let reads = 0;
    fetchMock.mockImplementation((input, init) => {
      if (init.method === "PATCH") return Promise.resolve(apiResponse({ data: { version: 4 } }));
      if (input === `/api/workspaces/${workspaceId}`) {
        reads += 1;
        return Promise.resolve(apiResponse({ data: workspace({ version: reads > 1 ? 4 : 3 }) }));
      }
      return defaultFetch(input);
    });
    render(<CommercialWorkspaceDetailPage />);
    fireEvent.change(await screen.findByLabelText("Próxima ação"), { target: { value: "Revisar proposta sintética" } });
    const form = screen.getByRole("button", { name: "Salvar acompanhamento" }).closest("form");
    fireEvent.submit(form!);
    fireEvent.submit(form!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível confirmar o resultado desta ação.");
    expect(screen.getByRole("button", { name: "Salvar acompanhamento" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Consultar acompanhamento atual" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar acompanhamento" })).toBeEnabled());
    expect(screen.getByLabelText("Próxima ação")).toHaveValue("Revisar proposta sintética");
    expect(fetchMock.mock.calls.filter(([, init]) => init.method === "PATCH")).toHaveLength(1);
  });

  it("shows rejected fields beside the form without discarding the workspace draft", async () => {
    fetchMock.mockImplementation((input, init) => init.method === "PATCH"
      ? Promise.resolve(apiResponse({ error: { code: "VALIDATION_ERROR", message: "private schema" } }, 400))
      : defaultFetch(input));
    render(<CommercialWorkspaceDetailPage />);
    fireEvent.change(await screen.findByLabelText("Próxima ação"), { target: { value: "Corrigir dados sintéticos" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar acompanhamento" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Os dados não foram aceitos. Confira os campos");
    expect(screen.getByLabelText("Próxima ação")).toHaveValue("Corrigir dados sintéticos");
    expect(document.body).not.toHaveTextContent("private schema");
  });
});
