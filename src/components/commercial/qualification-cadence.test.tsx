import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QualificationCadenceDto } from "../../types/commercial";

import { QualificationCadence } from "./qualification-cadence";

const workspaceId = "00000000-0000-4000-8000-000000000741";

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function activeCadence(
  currentContactNumber: 1 | 2 | 3 | 4 = 1,
): QualificationCadenceDto {
  return {
    status: "ACTIVE",
    current_contact_number: currentContactNumber,
    contacts: [1, 2, 3, 4].map((contactNumber) => {
      const completed = contactNumber < currentContactNumber;
      return {
        qualification_contact_id: `00000000-0000-4000-8000-00000000074${contactNumber}`,
        contact_number: contactNumber as 1 | 2 | 3 | 4,
        scheduled_at: `2026-08-${String(10 + contactNumber).padStart(2, "0")}T12:00:00.000Z`,
        state: completed ? "COMPLETED" : "PENDING",
        outcome: completed ? "NO_RESPONSE" : null,
        channel: completed ? "WHATSAPP" : null,
        summary: completed ? "Tentativa registrada." : null,
        completed_at: completed ? "2026-08-11T15:00:00.000Z" : null,
      };
    }),
  };
}

describe("qualification cadence", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const onCadenceChanged = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    onCadenceChanged.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("creates an assisted plan with exactly four scheduled contacts", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          data: {
            status: "NOT_STARTED",
            current_contact_number: null,
            contacts: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        response(
          { data: activeCadence(), meta: { result: "started" } },
          201,
        ),
      );

    render(
      <QualificationCadence
        workspaceId={workspaceId}
        canWrite
        onCadenceChanged={onCadenceChanged}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Plano de contatos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Plano de contatos" }),
    ).toHaveAttribute("id", "qualification-cadence");
    fireEvent.change(await screen.findByLabelText("Data do 1º contato"), {
      target: { value: "2026-08-11" },
    });
    fireEvent.change(screen.getByLabelText("Intervalo entre contatos (dias)"), {
      target: { value: "3" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Criar plano de 4 contatos" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/workspaces/${workspaceId}/qualification-cadence`,
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
          action: "start",
          start_at: "2026-08-11T12:00:00.000Z",
          interval_days: 3,
        }),
      }),
    );
    expect(await screen.findByText("1º Contato de qualificação")).toBeInTheDocument();
    expect(screen.getByText("4º Contato de qualificação")).toBeInTheDocument();
    expect(screen.queryByText("5º Contato de qualificação")).not.toBeInTheDocument();
    expect(onCadenceChanged).toHaveBeenCalledOnce();
  });

  it("shows four expandable rows and records how the lead reacted", async () => {
    const before = activeCadence(2);
    const after = activeCadence(3);
    fetchMock
      .mockResolvedValueOnce(response({ data: before }))
      .mockResolvedValueOnce(
        response({
          data: after,
          meta: {
            result: "recorded",
            pipelineAction: {
              kind: "automatic",
              commercial_stage: "FOLLOW_UP",
            },
          },
        }),
      );

    render(
      <QualificationCadence
        workspaceId={workspaceId}
        canWrite
        onCadenceChanged={onCadenceChanged}
      />,
    );

    expect(await screen.findAllByText(/Contato de qualificação/)).toHaveLength(4);
    const current = screen.getByTestId("qualification-contact-2");
    expect(within(current).getByText("Contato atual")).toBeInTheDocument();
    fireEvent.change(within(current).getByLabelText("Canal utilizado"), {
      target: { value: "CALL" },
    });
    fireEvent.change(within(current).getByLabelText("O que aconteceu?"), {
      target: { value: "FOLLOW_UP_LATER" },
    });
    expect(
      within(current).getByLabelText("Novo dia e horário do próximo contato"),
    ).toBeInTheDocument();
    fireEvent.change(within(current).getByLabelText("Data e horário da tentativa"), {
      target: { value: "2026-08-14T15:00" },
    });
    fireEvent.change(
      within(current).getByLabelText("Novo dia e horário do próximo contato"),
      { target: { value: "2026-08-28T12:00" } },
    );
    fireEvent.change(within(current).getByLabelText("Resumo do contato"), {
      target: { value: "A pessoa pediu retorno após o fechamento mensal." },
    });
    fireEvent.click(
      within(current).getByRole("button", { name: "Registrar 2º contato" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const posted = fetchMock.mock.calls[1];
    expect(posted?.[0]).toBe(
      `/api/workspaces/${workspaceId}/qualification-cadence`,
    );
    expect(JSON.parse(String(posted?.[1]?.body))).toEqual({
      action: "record_contact",
      contact_number: 2,
      occurred_at: new Date("2026-08-14T15:00").toISOString(),
      channel: "CALL",
      outcome: "FOLLOW_UP_LATER",
      summary: "A pessoa pediu retorno após o fechamento mensal.",
      next_contact_at: new Date("2026-08-28T12:00").toISOString(),
    });
    expect(await screen.findByText("3º Contato de qualificação")).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Resultado do acompanhamento" }),
    ).toHaveTextContent(
      "Etapa comercial atualizada automaticamente para Acompanhamento.",
    );
    expect(onCadenceChanged).toHaveBeenCalledOnce();
  });

  it("shows a human recommendation when the response is ambiguous", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ data: activeCadence(1) }))
      .mockResolvedValueOnce(
        response({
          data: activeCadence(2),
          meta: {
            result: "recorded",
            pipelineAction: {
              kind: "recommendation",
              commercial_stage: null,
            },
          },
        }),
      );

    render(<QualificationCadence workspaceId={workspaceId} canWrite />);

    const current = await screen.findByTestId("qualification-contact-1");
    fireEvent.change(within(current).getByLabelText("O que aconteceu?"), {
      target: { value: "RESPONDED" },
    });
    fireEvent.click(
      within(current).getByRole("button", { name: "Registrar 1º contato" }),
    );

    expect(
      await screen.findByRole("status", { name: "Resultado do acompanhamento" }),
    ).toHaveTextContent(
      "A etapa foi mantida e uma próxima ação foi recomendada para sua decisão.",
    );
  });

  it("does not offer a fifth contact from the fourth step", async () => {
    fetchMock.mockResolvedValueOnce(response({ data: activeCadence(4) }));

    render(<QualificationCadence workspaceId={workspaceId} canWrite />);

    const fourth = await screen.findByTestId("qualification-contact-4");
    const outcome = within(fourth).getByLabelText("O que aconteceu?");
    expect(within(outcome).queryByRole("option", { name: /falar mais tarde/i })).not.toBeInTheDocument();
    expect(
      within(fourth).queryByLabelText("Novo dia e horário do próximo contato"),
    ).not.toBeInTheDocument();
  });

  it("keeps the ledger visible but hides mutation controls in read-only mode", async () => {
    fetchMock.mockResolvedValueOnce(response({ data: activeCadence(2) }));

    render(<QualificationCadence workspaceId={workspaceId} canWrite={false} />);

    expect(await screen.findAllByText(/Contato de qualificação/)).toHaveLength(4);
    expect(screen.getByText("Plano de contatos disponível somente para leitura.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /registrar/i })).not.toBeInTheDocument();
  });

  it("fails closed for an invalid response and preserves a clear retry action", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ data: { status: "ACTIVE", contacts: [] } }))
      .mockResolvedValueOnce(
        response({
          data: {
            status: "NOT_STARTED",
            current_contact_number: null,
            contacts: [],
          },
        }),
      );

    render(<QualificationCadence workspaceId={workspaceId} canWrite />);

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Não foi possível consultar o plano de contatos agora.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(
      await screen.findByRole("button", { name: "Criar plano de 4 contatos" }),
    ).toBeInTheDocument();
  });
});

describe("qualification feedback recovery", () => {
  it("keeps the contact draft after a network failure and a failed read-only refresh", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ data: activeCadence(1) }))
      .mockRejectedValueOnce(new Error("private network cause"))
      .mockResolvedValueOnce(response({ error: { message: "private database" } }, 503))
      .mockResolvedValueOnce(response({ data: activeCadence(1) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<QualificationCadence workspaceId={workspaceId} canWrite />);
    const current = await screen.findByTestId("qualification-contact-1");
    fireEvent.change(within(current).getByLabelText("O que aconteceu?"), { target: { value: "RESPONDED" } });
    fireEvent.change(within(current).getByLabelText("Resumo do contato"), { target: { value: "Retorno sintético aguardando conferência" } });
    const form = within(current).getByRole("button", { name: "Registrar 1º contato" }).closest("form");
    fireEvent.submit(form!);
    fireEvent.submit(form!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível confirmar o resultado desta ação.");
    expect(within(current).getByLabelText("Resumo do contato")).toHaveValue("Retorno sintético aguardando conferência");
    fireEvent.click(screen.getByRole("button", { name: "Consultar plano atual" }));
    expect(await screen.findByText(/Não foi possível consultar o plano atual/)).toBeInTheDocument();
    expect(screen.getByLabelText("Resumo do contato")).toHaveValue("Retorno sintético aguardando conferência");
    expect(screen.getByRole("button", { name: "Registrar 1º contato" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Consultar plano novamente" }));
    await screen.findByRole("button", { name: "Conferi o plano; preparar novo registro" });
    expect(screen.getByRole("button", { name: "Registrar 1º contato" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Conferi o plano; preparar novo registro" }));
    expect(screen.getByRole("button", { name: "Registrar 1º contato" })).toBeEnabled();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(document.body).not.toHaveTextContent("private network cause");
    expect(document.body).not.toHaveTextContent("private database");
  });

  it("does not confirm a malformed successful mutation or lose the selected outcome", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ data: activeCadence(1) }))
      .mockResolvedValueOnce(response({ data: activeCadence(2), meta: { result: "recorded" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<QualificationCadence workspaceId={workspaceId} canWrite />);
    fireEvent.change(await screen.findByLabelText("O que aconteceu?"), { target: { value: "RESPONDED" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar 1º contato" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível confirmar o resultado desta ação.");
    expect(screen.getByLabelText("O que aconteceu?")).toHaveValue("RESPONDED");
    expect(screen.queryByRole("status", { name: "Resultado do acompanhamento" })).not.toBeInTheDocument();
  });
});

describe("qualification consultation access recovery", () => {
  it.each([
    [401, "Sua sessão expirou. Entre novamente", "Entrar novamente", "/login"],
    [403, "Solicite ao responsável a verificação do acesso.", null, null],
    [404, "Volte para leads e escolha uma empresa disponível.", "Voltar para leads", "/leads"],
  ] as const)("offers a safe next step after consultation status %s", async (status, guidance, linkLabel, href) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      response({ error: { message: "private failure detail" } }, status),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<QualificationCadence workspaceId={workspaceId} canWrite />);
    expect(await screen.findByRole("alert")).toHaveTextContent(guidance);
    expect(document.body).not.toHaveTextContent("private failure detail");
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).not.toBeInTheDocument();
    if (linkLabel !== null) {
      const link = screen.getByRole("link", { name: linkLabel });
      expect(link).toHaveAttribute("href", href);
      link.focus();
      expect(link).toHaveFocus();
    }
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
  });
});
