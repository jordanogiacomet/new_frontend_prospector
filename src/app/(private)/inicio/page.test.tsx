import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getServerAuthorizationMock, redirectMock, fetchMock } = vi.hoisted(
  () => ({
    getServerAuthorizationMock: vi.fn(),
    redirectMock: vi.fn(),
    fetchMock: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("../../../server/auth", () => ({
  getServerAuthorization: getServerAuthorizationMock,
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import StartPage, { dynamic } from "./page";

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

describe("manager import and analysis entry", () => {
  beforeEach(() => {
    getServerAuthorizationMock.mockReset();
    getServerAuthorizationMock.mockResolvedValue(
      authorizedSession(["imports:create", "imports:read", "leads:read"]),
    );
    redirectMock.mockReset();
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(["missing", "expired"])(
    "redirects a %s session before showing the business guide",
    async (status) => {
      getServerAuthorizationMock.mockResolvedValue({ status });

      await expect(StartPage()).rejects.toThrow("NEXT_REDIRECT");

      expect(redirectMock).toHaveBeenCalledExactlyOnceWith("/login");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("withholds the guide for an unauthorized organization", async () => {
    getServerAuthorizationMock.mockResolvedValue({
      status: "unauthorized",
      organizationId: "other-synthetic-organization",
    });

    render(await StartPage());

    expect(screen.getByRole("alert")).toHaveTextContent("Acesso não autorizado");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("other-synthetic-organization");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers the existing import, history and priority-filtered analysis routes", async () => {
    render(await StartPage());

    expect(screen.getByRole("heading", { name: "Importar e analisar empresas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Importar CSV" })).toHaveAttribute("href", "/imports");
    expect(screen.getByRole("link", { name: "Acompanhar importações" })).toHaveAttribute("href", "/imports/batches");
    expect(screen.getByRole("link", { name: "Prioridade B" })).toHaveAttribute("href", "/leads?priority=B");
    expect(screen.getByRole("link", { name: "Prioridade C" })).toHaveAttribute("href", "/leads?priority=C");
    expect(screen.getByRole("link", { name: "Ver todas as empresas" })).toHaveAttribute("href", "/leads");
    expect(document.body).toHaveTextContent("não garantem uma oportunidade");
    expect(document.body).toHaveTextContent("não significa zero");
    expect(document.body).toHaveTextContent("consulte o histórico antes de reenviar");
    expect(document.body).not.toHaveTextContent(/synthetic-manager|synthetic-organization|identity\.synthetic|workflow|n8n|garantia de retorno/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { permissions: ["imports:create"], expected: ["/imports"] },
    { permissions: ["imports:read"], expected: ["/imports/batches"] },
    { permissions: ["leads:read"], expected: ["/leads?priority=B", "/leads?priority=C", "/leads"] },
  ])("shows only the actions authorized by $permissions", async ({ permissions, expected }) => {
    getServerAuthorizationMock.mockResolvedValue(authorizedSession(permissions));

    render(await StartPage());

    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(expected);
    expect(document.body).toHaveTextContent("Seu acesso não permite");
  });

  it.each([[], ["admin:all"], ["commercial:read"]])(
    "does not grant import or analysis actions from unrelated or unknown permissions %j",
    async (...permissions) => {
      getServerAuthorizationMock.mockResolvedValue(authorizedSession(permissions));

      render(await StartPage());

      expect(screen.getByRole("heading", { name: "Acesso ao fluxo indisponível" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Consultar ajuda" })).toHaveAttribute("href", "/ajuda");
      expect(screen.getAllByRole("link")).toHaveLength(1);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("keeps the private guide out of shared rendering cache", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("removes pipeline actions even for a commercial actor", async () => {
    getServerAuthorizationMock.mockResolvedValue(authorizedSession(["leads:read", "commercial:read"]));

    render(await StartPage());

    expect(screen.getByRole("heading", { name: "Importar e analisar empresas" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Organizar acompanhamento" })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/work-queue"]')).toBeNull();
    expect(document.body).not.toHaveTextContent(/pipeline de prospecção/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("guides an authorized contact actor to the company detail", async () => {
    getServerAuthorizationMock.mockResolvedValue(authorizedSession(["leads:read", "contacts:enrich", "contacts:read"]));

    render(await StartPage());

    expect(screen.getByRole("heading", { name: "Encontrar contatos de uma empresa" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Escolher empresa" })).toHaveAttribute("href", "/leads");
    expect(document.body).toHaveTextContent("Abra a empresa em Leads e consulte a seção Contatos");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["imports:read", "contacts:enrich", "contacts:read"],
    ["leads:read", "contacts:enrich"],
    ["leads:read", "contacts:read"],
  ])("does not offer contact access with incomplete capabilities %j", async (...permissions) => {
    getServerAuthorizationMock.mockResolvedValue(authorizedSession(permissions));

    render(await StartPage());

    expect(screen.queryByRole("link", { name: "Escolher empresa" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a costs actor start their authorized routine without import or lead access", async () => {
    getServerAuthorizationMock.mockResolvedValue(authorizedSession(["costs:read"]));

    render(await StartPage());

    expect(screen.getByRole("heading", { name: "Sua rotina comercial" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Consultar custos" })).toHaveAttribute("href", "/costs");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Importar CSV" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver todas as empresas" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("importe uma lista");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
