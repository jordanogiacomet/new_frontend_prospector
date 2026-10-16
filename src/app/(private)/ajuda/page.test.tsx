import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getServerAuthorizationMock, redirectMock, fetchMock } = vi.hoisted(() => ({
  getServerAuthorizationMock: vi.fn(),
  redirectMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../server/auth", () => ({ getServerAuthorization: getServerAuthorizationMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import HelpPage, { dynamic } from "./page";

function authorizedSession(permissions: readonly string[]) {
  return {
    status: "authorized",
    actor: {
      issuer: "https://identity.synthetic.test",
      subject: "synthetic-manager",
      organizationId: "synthetic-organization",
      permissions,
    },
  };
}

describe("private help for the manager MVP", () => {
  beforeEach(() => {
    getServerAuthorizationMock.mockReset();
    getServerAuthorizationMock.mockResolvedValue(authorizedSession([]));
    redirectMock.mockReset();
    redirectMock.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it.each(["missing", "expired"])("redirects a %s session before displaying help", async (status) => {
    getServerAuthorizationMock.mockResolvedValue({ status });

    await expect(HelpPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledExactlyOnceWith("/login");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("denies an unauthorized organization without showing help or identity", async () => {
    getServerAuthorizationMock.mockResolvedValue({ status: "unauthorized", organizationId: "other-synthetic-organization" });

    render(await HelpPage());

    expect(screen.getByRole("alert")).toHaveTextContent("Acesso não autorizado");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("other-synthetic-organization");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives an authenticated person practical guidance without data or mutation access", async () => {
    render(await HelpPage());

    expect(screen.getByRole("heading", { name: "Ajuda para importar e analisar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao início" })).toHaveAttribute("href", "/inicio");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Por onde começar" })).not.toBeInTheDocument();
    expect(document.body).toHaveTextContent("Um CSV EmpresaAqui por envio");
    expect(document.body).toHaveTextContent("não confirma que todas as análises terminaram");
    expect(document.body).toHaveTextContent("não significa zero");
    expect(document.body).toHaveTextContent("não garante uma oportunidade");
    expect(document.body).toHaveTextContent("antes de qualquer novo envio");
    expect(document.body).toHaveTextContent("Mantenha a tela de importação aberta");
    expect(document.body).not.toHaveTextContent(/synthetic-manager|synthetic-organization|identity\.synthetic|workflow|n8n|SQL|https?:\/\//i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { permissions: ["imports:create"], destinations: ["/inicio", "/imports"], step: "Importe sua lista." },
    { permissions: ["imports:read"], destinations: ["/inicio", "/imports/batches"], step: "Acompanhe o envio." },
    { permissions: ["leads:read"], destinations: ["/inicio", "/leads"], step: "Revise as empresas." },
  ])("offers only actions granted to $permissions", async ({ permissions, destinations, step }) => {
    getServerAuthorizationMock.mockResolvedValue(authorizedSession(permissions));

    render(await HelpPage());

    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(destinations);
    const guide = screen.getByRole("region", { name: "Por onde começar" });
    expect(guide.querySelectorAll("li")).toHaveLength(1);
    expect(guide).toHaveTextContent(step);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps help private and out of shared rendering cache", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("does not restore pipeline actions for a commercial actor", async () => {
    getServerAuthorizationMock.mockResolvedValue(authorizedSession(["commercial:read"]));

    render(await HelpPage());

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Por onde começar" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/pipeline de prospecção/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains direct contact discovery for an authorized contact actor with lead access", async () => {
    getServerAuthorizationMock.mockResolvedValue(authorizedSession(["leads:read", "contacts:enrich", "contacts:read"]));

    render(await HelpPage());

    expect(screen.getByText("Como encontrar contatos de uma empresa?", { exact: true })).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Abra a empresa em Leads e vá à seção Contatos");
    expect(document.body).toHaveTextContent("confirme o resultado");
    expect(document.body).toHaveTextContent("não envia mensagens");
    expect(document.querySelector('a[href="/work-queue"]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["contacts:enrich", "contacts:read"],
    ["leads:read", "contacts:enrich"],
    ["leads:read", "contacts:read"],
  ])("withholds contact guidance with incomplete capabilities %j", async (...permissions) => {
    getServerAuthorizationMock.mockResolvedValue(authorizedSession(permissions));

    render(await HelpPage());

    expect(screen.queryByText("Como encontrar contatos de uma empresa?", { exact: true })).not.toBeInTheDocument();
  });
});
