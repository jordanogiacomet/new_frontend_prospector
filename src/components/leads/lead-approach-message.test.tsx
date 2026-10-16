import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LeadDetail } from "../../types/leads";
import { LeadApproachMessage } from "./lead-approach-message";

type ApproachLead = Pick<
  LeadDetail,
  | "cnpj"
  | "lead_run_id"
  | "companyName"
  | "tradeName"
  | "legalName"
  | "sector"
  | "strategicReport"
>;

function lead(overrides: Partial<ApproachLead> = {}): ApproachLead {
  return {
    cnpj: "11222333000181",
    lead_run_id: `lr_${"a".repeat(64)}`,
    companyName: "Empresa Aurora Sintética",
    tradeName: "Aurora",
    legalName: "Empresa Aurora Sintética Ltda.",
    sector: "Serviços empresariais",
    strategicReport: {
      status: "available",
      content:
        "Relatório comercial sintético\n\nProblema identificado: retrabalho na consolidação de dados regionais",
    },
    ...overrides,
  };
}

describe("lead approach message", () => {
  const writeText = vi.fn<(value: string) => Promise<void>>();
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue();
    fetchMock.mockReset();
    fetchMock.mockImplementation((_input, init) => {
      if (init?.method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { status: "missing", message: null },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      return Promise.reject(new Error("Unexpected approach request"));
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it("shows an editable company-specific draft and the human-review boundary", () => {
    render(<LeadApproachMessage lead={lead()} />);

    const message = screen.getByRole("textbox", {
      name: "Mensagem de abordagem",
    });

    expect((message as HTMLTextAreaElement).value).toContain("Aurora");
    expect((message as HTMLTextAreaElement).value).toContain(
      "retrabalho na consolidação de dados regionais",
    );
    expect(screen.getByText("Foco da abordagem")).toBeInTheDocument();
    expect(
      screen.getByText("retrabalho na consolidação de dados regionais"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/rascunho para revisão humana/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/nenhuma mensagem é enviada pelo Prospecta/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Gerar com IA" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/pode gerar custo/i)).toBeInTheDocument();
  });

  it("generates once on explicit action and replaces the textarea only after a valid response", async () => {
    const generatedMessage = [
      "Olá! Tudo bem?",
      "A Empresa Aurora Sintética combina atuação em serviços empresariais com uma operação voltada à consolidação de dados regionais.",
      "Hoje, reduzir esse retrabalho está entre as prioridades da equipe?",
      "Se sim, vale uma conversa breve nos próximos dias?",
    ].join("\n\n");
    let resolveResponse: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((_input, init) =>
      init?.method === "GET"
        ? Promise.resolve(
            new Response(
              JSON.stringify({ data: { status: "missing", message: null } }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          )
        : new Promise<Response>((resolve) => {
            resolveResponse = resolve;
          }),
    );
    const currentLead = lead();
    const { rerender } = render(<LeadApproachMessage lead={currentLead} />);
    const message = screen.getByRole("textbox", {
      name: "Mensagem de abordagem",
    });
    const initialValue = (message as HTMLTextAreaElement).value;

    fireEvent.click(screen.getByRole("button", { name: "Gerar com IA" }));

    expect(
      screen.getByRole("button", { name: "Gerando mensagem…" }),
    ).toBeDisabled();
    expect(message).toHaveValue(initialValue);
    const postCalls = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );
    expect(postCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/leads/11222333000181/approach-message?leadRunId=${currentLead.lead_run_id}`,
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(postCalls[0]?.[1]).not.toHaveProperty("body");

    resolveResponse?.(
      new Response(JSON.stringify({ data: { message: generatedMessage } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(
      await screen.findByText(
        "Mensagem gerada. Revise os fatos e o tom antes de usar.",
      ),
    ).toBeInTheDocument();
    expect(message).toHaveValue(generatedMessage);

    rerender(<LeadApproachMessage lead={{ ...currentLead }} />);
    expect(message).toHaveValue(generatedMessage);
  });

  it("keeps the current edited draft when AI generation fails", async () => {
    fetchMock.mockImplementation((_input, init) =>
      Promise.resolve(
        init?.method === "GET"
          ? new Response(
              JSON.stringify({ data: { status: "missing", message: null } }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            )
          : new Response(
              JSON.stringify({
                error: {
                  code: "DATA_SOURCE_UNAVAILABLE",
                  message: "private upstream details",
                },
              }),
              { status: 503, headers: { "Content-Type": "application/json" } },
            ),
      ),
    );
    render(<LeadApproachMessage lead={lead()} />);
    const message = screen.getByRole("textbox", {
      name: "Mensagem de abordagem",
    });
    fireEvent.change(message, {
      target: { value: "Rascunho humano que deve ser preservado." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Gerar com IA" }));

    expect(
      await screen.findByText(
        "Não foi possível confirmar a geração. O motivo não foi informado. Seu rascunho foi mantido. Use Consultar mensagem antes de decidir gerar novamente.",
      ),
    ).toBeInTheDocument();
    expect(message).toHaveValue("Rascunho humano que deve ser preservado.");
    expect(document.body).not.toHaveTextContent("private upstream details");
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
  });

  it("ignores a late generation response after the lead source changes", async () => {
    const generatedForFirst =
      "Esta resposta longa foi gerada para a Empresa Aurora Sintética e não pode aparecer depois que a tela muda para outra empresa durante a chamada externa.";
    let resolveResponse: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((_input, init) =>
      init?.method === "GET"
        ? Promise.resolve(
            new Response(
              JSON.stringify({ data: { status: "missing", message: null } }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          )
        : new Promise<Response>((resolve) => {
            resolveResponse = resolve;
          }),
    );
    const { rerender } = render(<LeadApproachMessage lead={lead()} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar com IA" }));

    rerender(
      <LeadApproachMessage
        lead={lead({
          cnpj: "99888777000166",
          lead_run_id: `lr_${"b".repeat(64)}`,
          companyName: "Empresa Horizonte Sintética",
          tradeName: "Horizonte",
          strategicReport: {
            status: "available",
            content: "Desafio principal: reduzir perdas na operação regional",
          },
        })}
      />,
    );

    resolveResponse?.(
      new Response(
        JSON.stringify({ data: { message: generatedForFirst } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await waitFor(() =>
      expect(
        (
          screen.getByRole("textbox", {
            name: "Mensagem de abordagem",
          }) as HTMLTextAreaElement
        ).value,
      ).toContain("Horizonte"),
    );
    expect(document.body).not.toHaveTextContent(generatedForFirst);
  });

  it("copies the exact edited draft and announces success", async () => {
    render(<LeadApproachMessage lead={lead()} />);
    const message = screen.getByRole("textbox", {
      name: "Mensagem de abordagem",
    });

    fireEvent.change(message, {
      target: { value: "Olá, Aurora! Mensagem revisada pela pessoa responsável." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Copiar mensagem" }),
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "Olá, Aurora! Mensagem revisada pela pessoa responsável.",
      ),
    );
    expect(
      await screen.findByText("Mensagem copiada."),
    ).toBeInTheDocument();
  });

  it("hydrates the exact persisted AI message without a provider-generating POST", async () => {
    const persistedMessage =
      "Olá, equipe Aurora. Esta é a mensagem persistida que também aparece na fila comercial.";
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { status: "ready", message: persistedMessage },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const currentLead = lead();

    render(<LeadApproachMessage lead={currentLead} />);

    expect(
      await screen.findByRole("textbox", { name: "Mensagem de abordagem" }),
    ).toHaveValue(persistedMessage);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/leads/${currentLead.cnpj}/approach-message?leadRunId=${encodeURIComponent(currentLead.lead_run_id)}`,
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
  });

  it("keeps the edited draft when polling returns the same source and resets it for a new company", () => {
    const firstLead = lead();
    const { rerender } = render(<LeadApproachMessage lead={firstLead} />);
    const message = screen.getByRole("textbox", {
      name: "Mensagem de abordagem",
    });

    fireEvent.change(message, { target: { value: "Revisão local preservada" } });
    rerender(<LeadApproachMessage lead={{ ...firstLead }} />);
    expect(message).toHaveValue("Revisão local preservada");

    rerender(
      <LeadApproachMessage
        lead={lead({
          companyName: "Empresa Horizonte Sintética",
          tradeName: "Horizonte",
          strategicReport: {
            status: "available",
            content: "Desafio principal: reduzir perdas na operação regional",
          },
        })}
      />,
    );

    expect((message as HTMLTextAreaElement).value).toContain("Horizonte");
    expect((message as HTMLTextAreaElement).value).toContain(
      "reduzir perdas na operação regional",
    );
    expect(message).not.toHaveValue("Revisão local preservada");
  });

  it("shows a report-grounded draft when there is an opportunity but no problem", () => {
    render(
      <LeadApproachMessage
        lead={lead({
          strategicReport: {
            status: "available",
            content:
              "Oportunidade: expansão regional\nSetor detectado: serviços_empresariais",
          },
        })}
      />,
    );

    expect(
      (
        screen.getByRole("textbox", {
          name: "Mensagem de abordagem",
        }) as HTMLTextAreaElement
      ).value,
    ).toContain("expansão regional");
    expect(screen.getByText("expansão regional")).toBeInTheDocument();
  });

  it("shows a neutral editable draft when the report has no customer-facing fact", () => {
    render(
      <LeadApproachMessage
        lead={lead({
          sector: null,
          strategicReport: {
            status: "available",
            content:
              "Prioridade comercial: R\nFit estratégico: 72/100\nConfiança: média",
          },
        })}
      />,
    );

    expect(
      (
        screen.getByRole("textbox", {
          name: "Mensagem de abordagem",
        }) as HTMLTextAreaElement
      ).value,
    ).toContain("Aurora");
    expect(screen.getByText("Identidade da empresa")).toBeInTheDocument();
    expect(screen.getByText("Momento e prioridades atuais")).toBeInTheDocument();
  });

  it("explains when an available report cannot be paired with a company identity", () => {
    render(
      <LeadApproachMessage
        lead={lead({ companyName: null, tradeName: null, legalName: null })}
      />,
    );

    expect(
      screen.getByText("Empresa sem identificação suficiente"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Mensagem de abordagem" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the draft and gives an actionable message when copying fails", async () => {
    writeText.mockRejectedValue(new Error("clipboard unavailable"));
    render(<LeadApproachMessage lead={lead()} />);
    const message = screen.getByRole("textbox", {
      name: "Mensagem de abordagem",
    });
    const originalDraft = (message as HTMLTextAreaElement).value;

    fireEvent.click(
      screen.getByRole("button", { name: "Copiar mensagem" }),
    );

    expect(
      await screen.findByText(
        "Não foi possível copiar. Selecione o texto e copie manualmente.",
      ),
    ).toBeInTheDocument();
    expect(message).toHaveValue(originalDraft);
  });

  it("disables copying when the edited message is empty", () => {
    render(<LeadApproachMessage lead={lead()} />);

    fireEvent.change(
      screen.getByRole("textbox", { name: "Mensagem de abordagem" }),
      { target: { value: "   " } },
    );

    expect(
      screen.getByRole("button", { name: "Copiar mensagem" }),
    ).toBeDisabled();
  });

  it.each([
    ["missing", "Relatório ainda não disponível"],
    ["unavailable", "Relatório indisponível para esta mensagem"],
    ["omitted_by_policy", "Relatório retido para esta mensagem"],
  ] as const)(
    "does not expose a draft or copy action when the report is %s",
    (status, title) => {
      render(
        <LeadApproachMessage
          lead={lead({ strategicReport: { status, content: null } })}
        />,
      );

      expect(screen.getByText(title)).toBeInTheDocument();
      expect(
        screen.queryByRole("textbox", { name: "Mensagem de abordagem" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Copiar mensagem" }),
      ).not.toBeInTheDocument();
    },
  );
  it.each(["network", "invalid"] as const)("consults by GET after %s generation results without repeating the mutation", async (failure) => {
    let consultations = 0;
    fetchMock.mockImplementation((_input, init) => {
      if (init?.method === "POST") return failure === "network"
        ? Promise.reject(new Error("private connection detail"))
        : Promise.resolve(new Response(JSON.stringify({ data: { message: "" } }), { status: 200 }));
      consultations += 1;
      return Promise.resolve(new Response(JSON.stringify({ data: consultations === 1
        ? { status: "missing", message: null }
        : { status: "ready", message: "Mensagem sintética confirmada." } }), { status: 200 }));
    });
    render(<LeadApproachMessage lead={lead()} />);
    const textbox = screen.getByRole("textbox", { name: "Mensagem de abordagem" });
    fireEvent.change(textbox, { target: { value: "Rascunho manual preservado." } });
    const generate = screen.getByRole("button", { name: "Gerar com IA" });
    fireEvent.click(generate);
    fireEvent.click(generate);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível confirmar a geração");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Consultar mensagem" }));
    await screen.findByRole("button", { name: "Usar mensagem gerada" });
    expect(textbox).toHaveValue("Rascunho manual preservado.");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Usar mensagem gerada" }));
    expect(textbox).toHaveValue("Mensagem sintética confirmada.");
    expect(document.body).not.toHaveTextContent("private connection detail");
  });

  it("keeps edits made while the generation is pending and offers the returned message explicitly", async () => {
    let resolveGeneration: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((_input, init) => init?.method === "POST"
      ? new Promise((resolve) => { resolveGeneration = resolve; })
      : Promise.resolve(new Response(JSON.stringify({ data: { status: "missing", message: null } }), { status: 200 })));
    render(<LeadApproachMessage lead={lead()} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar com IA" }));
    const textbox = screen.getByRole("textbox", { name: "Mensagem de abordagem" });
    fireEvent.change(textbox, { target: { value: "Edição feita durante a espera." } });
    expect(screen.getByRole("button", { name: "Gerando mensagem…" })).toBeDisabled();
    resolveGeneration?.(new Response(JSON.stringify({ data: { message: "Nova mensagem sintética." } }), { status: 200 }));
    await screen.findByRole("button", { name: "Usar mensagem gerada" });
    expect(textbox).toHaveValue("Edição feita durante a espera.");
    fireEvent.click(screen.getByRole("button", { name: "Copiar mensagem" }));
    await screen.findByText("Mensagem copiada.");
    fireEvent.click(screen.getByRole("button", { name: "Usar mensagem gerada" }));
    expect(textbox).toHaveValue("Nova mensagem sintética.");
    expect(screen.queryByText("Mensagem copiada.")).not.toBeInTheDocument();
  });

  it.each([[401, "Sua sessão expirou"], [403, "não permite esta ação"], [409, "entra em conflito"], [422, "Os dados não foram aceitos"]])("explains generation rejection %i without exposing diagnostics", async (status, explanation) => {
    fetchMock.mockImplementation((_input, init) => Promise.resolve(new Response(JSON.stringify(init?.method === "POST"
      ? { error: { message: "private provider details" } }
      : { data: { status: "missing", message: null } }), { status: init?.method === "POST" ? Number(status) : 200 })));
    render(<LeadApproachMessage lead={lead()} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar com IA" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(String(explanation));
    expect(document.body).not.toHaveTextContent("private provider details");
    if (status === 401) expect(screen.getByRole("link", { name: "Entrar novamente" })).toHaveAttribute("href", "/login");
  });

  it("gives immediate clipboard feedback, prevents double copy and selects the draft for manual recovery", async () => {
    let rejectCopy: ((reason: Error) => void) | undefined;
    writeText.mockImplementation(() => new Promise((_resolve, reject) => { rejectCopy = reject; }));
    render(<LeadApproachMessage lead={lead()} />);
    const copy = screen.getByRole("button", { name: "Copiar mensagem" });
    fireEvent.click(copy);
    fireEvent.click(copy);
    expect(screen.getByRole("button", { name: "Copiando mensagem…" })).toBeDisabled();
    expect(writeText).toHaveBeenCalledOnce();
    rejectCopy?.(new Error("clipboard unavailable"));
    fireEvent.click(await screen.findByRole("button", { name: "Selecionar texto para copiar" }));
    const textbox = screen.getByRole("textbox", { name: "Mensagem de abordagem" }) as HTMLTextAreaElement;
    expect(textbox).toHaveFocus();
    expect(textbox.selectionEnd - textbox.selectionStart).toBe(textbox.value.length);
  });

  it("consults an unconfirmed generation after leaving and returning to the same lead", async () => {
    fetchMock.mockImplementation((_input, init) => init?.method === "POST"
      ? new Promise<Response>(() => {})
      : Promise.resolve(new Response(JSON.stringify({ data: { status: "missing", message: null } }), { status: 200 })));
    const firstLead = lead();
    const view = render(<LeadApproachMessage lead={firstLead} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar com IA" }));
    view.rerender(<LeadApproachMessage lead={lead({ cnpj: "99888777000166", lead_run_id: `lr_${"b".repeat(64)}` })} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    view.rerender(<LeadApproachMessage lead={firstLead} />);
    expect(await screen.findByRole("button", { name: "Consultar mensagem" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível confirmar a geração");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

});
