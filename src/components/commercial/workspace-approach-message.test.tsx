import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceApproachMessage } from "./workspace-approach-message";

const cnpj = "12345678000195";
const leadRunId = `lr_${"a".repeat(64)}`;

describe("workspace approach message", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writeText = vi.fn<(value: string) => Promise<void>>();

  beforeEach(() => {
    fetchMock.mockReset();
    writeText.mockReset();
    writeText.mockResolvedValue();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it("shows and copies the exact persisted message without generating another one", async () => {
    const message =
      "Olá, equipe Aurora. Esta mensagem única também aparece no lead e na fila comercial.";
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ data: { status: "ready", message } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<WorkspaceApproachMessage cnpj={cnpj} leadRunId={leadRunId} />);

    const textbox = await screen.findByRole("textbox", {
      name: "Mensagem de abordagem",
    });
    expect(textbox).toHaveValue(message);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/leads/${cnpj}/approach-message?leadRunId=${encodeURIComponent(leadRunId)}`,
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.change(textbox, { target: { value: `${message} Revisada.` } });
    fireEvent.click(screen.getByRole("button", { name: "Copiar mensagem" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${message} Revisada.`));
    expect(
      screen.getByRole("link", {
        name: "Próximo: registrar no plano de contatos",
      }),
    ).toHaveAttribute("href", "#qualification-cadence");
  });

  it("directs the manager to the lead without promising gated AI generation when no draft exists", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ data: { status: "missing", message: null } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <WorkspaceApproachMessage
        cnpj={cnpj}
        leadRunId={leadRunId}
        leadReturnTo="/workspaces/00000000-0000-4000-8000-000000000041?returnTo=%2Fwork-queue%3Fpage%3D2"
      />,
    );

    expect(
      await screen.findByText("Ainda não há uma mensagem preparada para esta empresa."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver avaliação da empresa" })).toHaveAttribute(
      "href",
      `/leads/${cnpj}?leadRunId=${encodeURIComponent(leadRunId)}&returnTo=%2Fworkspaces%2F00000000-0000-4000-8000-000000000041%3FreturnTo%3D%252Fwork-queue%253Fpage%253D2`,
    );
    expect(
      screen.queryByRole("button", { name: /gerar com ia/i }),
    ).not.toBeInTheDocument();
  });

  it("fails closed when the cache response is unavailable or invalid", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { message: "sem estado" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<WorkspaceApproachMessage cnpj={cnpj} leadRunId={leadRunId} />);

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Não foi possível atualizar esta consulta.");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("recovers a failed consultation by GET and preserves edits after a refresh failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("private network details"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { status: "ready", message: "Mensagem sintética persistida." } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "private diagnostics" } }), { status: 503 }));
    render(<WorkspaceApproachMessage cnpj={cnpj} leadRunId={leadRunId} />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Consultar mensagem" }));
    const textbox = await screen.findByRole("textbox", { name: "Mensagem de abordagem" });
    fireEvent.change(textbox, { target: { value: "Mensagem revisada pelo usuário." } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar mensagem" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Tente atualizar novamente");
    expect(textbox).toHaveValue("Mensagem revisada pelo usuário.");
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    expect(document.body).not.toHaveTextContent("private diagnostics");
  });

  it.each([[401, "Sua sessão expirou"], [403, "não permite esta ação"]])("explains consultation access failure %i", async (status, explanation) => {
    const onSessionExpired = vi.fn();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "private details" } }), { status: Number(status) }));
    render(<WorkspaceApproachMessage cnpj={cnpj} leadRunId={leadRunId} onSessionExpired={onSessionExpired} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(String(explanation));
    expect(screen.queryByRole("button", { name: "Consultar mensagem" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private details");
    if (status === 401) {
      expect(onSessionExpired).toHaveBeenCalledOnce();
      expect(screen.getByRole("link", { name: "Entrar novamente" })).toHaveAttribute("href", "/login");
    }
  });

});
