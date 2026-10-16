import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getServerAuthorizationMock,
  isDemoDataEnabledMock,
  pathnameState,
  redirectMock,
  signOutMock,
} = vi.hoisted(
  () => ({
    getServerAuthorizationMock: vi.fn(),
    isDemoDataEnabledMock: vi.fn(),
    pathnameState: { value: "/leads" },
    redirectMock: vi.fn(),
    signOutMock: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));

vi.mock("../../server/auth", () => ({
  getServerAuthorization: getServerAuthorizationMock,
  signOut: signOutMock,
}));

vi.mock("../../server/demo/mode", () => ({
  isDemoDataEnabled: isDemoDataEnabledMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  usePathname: () => pathnameState.value,
}));

import PrivateLayout, { dynamic } from "./layout";

const privateContentRender = vi.fn();

function PrivateContent() {
  privateContentRender();

  return <p>Conteúdo privado sintético</p>;
}

function authorizedSession(
  permissions: readonly string[] = [
    "leads:read",
    "commercial:read",
    "imports:read",
  ],
) {
  return {
    status: "authorized" as const,
    actor: {
      issuer: "https://identity.internal.test/tenant",
      organizationId: "synthetic-organization",
      subject: "synthetic-subject",
      permissions,
    },
  };
}

function listAppSurface(directory: string, appRoot: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...listAppSurface(entryPath, appRoot));
      continue;
    }

    if (
      entry.isFile() &&
      /^(?:layout|page|route)\.(?:ts|tsx)$/.test(entry.name)
    ) {
      files.push(relative(appRoot, entryPath).replaceAll("\\", "/"));
    }
  }

  return files;
}

describe("private application shell", () => {
  beforeEach(() => {
    getServerAuthorizationMock.mockReset();
    isDemoDataEnabledMock.mockReset();
    isDemoDataEnabledMock.mockReturnValue(false);
    pathnameState.value = "/leads";
    redirectMock.mockReset();
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    signOutMock.mockReset();
    privateContentRender.mockReset();
  });

  it("redirects a missing session without rendering private children", async () => {
    getServerAuthorizationMock.mockResolvedValue({ status: "missing" });

    await expect(
      PrivateLayout({ children: <PrivateContent /> }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledExactlyOnceWith("/login");
    expect(privateContentRender).not.toHaveBeenCalled();
  });

  it("redirects an expired session without rendering private children", async () => {
    getServerAuthorizationMock.mockResolvedValue({ status: "expired" });

    await expect(
      PrivateLayout({ children: <PrivateContent /> }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledExactlyOnceWith("/login");
    expect(privateContentRender).not.toHaveBeenCalled();
  });

  it("shows a safe access-denied state without private children or identity details", async () => {
    const internalValues = [
      "https://identity.internal.test/tenant",
      "synthetic-organization",
      "synthetic-subject",
      "synthetic-access-token",
      "organization-oidc",
    ];

    getServerAuthorizationMock.mockResolvedValue({
      status: "unauthorized",
      issuer: internalValues[0],
      organizationId: internalValues[1],
      subject: internalValues[2],
      accessToken: internalValues[3],
      provider: internalValues[4],
      claims: { org_id: internalValues[1] },
    });

    render(await PrivateLayout({ children: <PrivateContent /> }));

    expect(
      screen.getByRole("heading", { name: "Acesso não autorizado" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Seu acesso não está autorizado para este ambiente.",
    );
    expect(privateContentRender).not.toHaveBeenCalled();
    expect(screen.queryByText("Conteúdo privado sintético")).not.toBeInTheDocument();

    for (const internalValue of internalValues) {
      expect(document.body).not.toHaveTextContent(internalValue);
    }

    expect(document.body).not.toHaveTextContent(
      /org_id|claims?|access.?token|provider|issuer/i,
    );
  });

  it("renders navigation, generic session status, children, and accessible controls for an authorized session", async () => {
    getServerAuthorizationMock.mockResolvedValue(authorizedSession());

    render(await PrivateLayout({ children: <PrivateContent /> }));

    const navigation = screen.getByRole("navigation", {
      name: "Navegação principal",
    });
    const leadsLink = screen.getByRole("link", { name: "Leads" });
    const importsLink = screen.getByRole("link", { name: "Importações" });
    const signOutButton = screen.getByRole("button", { name: "Sair" });
    const skipLink = screen.getByRole("link", {
      name: "Pular para o conteúdo principal",
    });

    expect(navigation).toContainElement(leadsLink);
    expect(navigation).toContainElement(importsLink);
    expect(leadsLink).toHaveAttribute("href", "/leads");
    expect(navigation.querySelector('a[href="/work-queue"]')).toBeNull();
    expect(importsLink).toHaveAttribute("href", "/imports/batches");
    expect(
      screen.queryByRole("link", { name: "Custos" }),
    ).not.toBeInTheDocument();
    expect(leadsLink).toHaveAttribute("aria-current", "page");
    expect(importsLink).not.toHaveAttribute("aria-current");
    expect(skipLink).toHaveAttribute("href", "#conteudo-principal");
    expect(screen.getByText("Sessão autorizada")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute(
      "id",
      "conteudo-principal",
    );
    expect(screen.getByText("Conteúdo privado sintético")).toBeInTheDocument();

    leadsLink.focus();
    expect(leadsLink).toHaveFocus();
    signOutButton.focus();
    expect(signOutButton).toHaveFocus();

    expect(document.body).not.toHaveTextContent(
      /identity\.internal|synthetic-organization|synthetic-subject|org_id|claims?|token|provider|issuer/i,
    );
  });

  it("marks import routes as current without changing authorization", async () => {
    pathnameState.value = "/imports/batches";
    getServerAuthorizationMock.mockResolvedValue(authorizedSession());

    render(await PrivateLayout({ children: <PrivateContent /> }));

    expect(screen.getByRole("link", { name: "Importações" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Leads" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByText("Conteúdo privado sintético")).toBeInTheDocument();
  });

  it("keeps the removed pipeline out of navigation on its legacy route", async () => {
    pathnameState.value = "/work-queue";
    getServerAuthorizationMock.mockResolvedValue(authorizedSession());

    render(await PrivateLayout({ children: <PrivateContent /> }));

    expect(screen.queryByRole("link", { name: "Pipeline de prospecção" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navegação principal" }).querySelector('a[href="/work-queue"]')).toBeNull();
    expect(screen.getByText("Conteúdo privado sintético")).toBeInTheDocument();
  });

  it("shows the costs entry only when the server-side actor has costs read access", async () => {
    pathnameState.value = "/costs";
    getServerAuthorizationMock.mockResolvedValue(
      authorizedSession([
        "leads:read",
        "commercial:read",
        "imports:read",
        "costs:read",
      ]),
    );

    render(await PrivateLayout({ children: <PrivateContent /> }));

    const costsLink = screen.getByRole("link", { name: "Custos" });
    expect(costsLink).toHaveAttribute("href", "/costs");
    expect(costsLink).toHaveAttribute("aria-current", "page");
  });

  it("hides business areas that the actor cannot read", async () => {
    getServerAuthorizationMock.mockResolvedValue(
      authorizedSession(["imports:create"]),
    );

    render(await PrivateLayout({ children: <PrivateContent /> }));

    expect(screen.queryByRole("link", { name: "Leads" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Pipeline de prospecção" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Importações" })).toHaveAttribute(
      "href",
      "/imports",
    );
    expect(screen.queryByRole("link", { name: "Custos" })).not.toBeInTheDocument();
  });

  it("keeps historical follow-ups accessible without restoring pipeline navigation", async () => {
    pathnameState.value = "/workspaces/11111111-1111-4111-8111-111111111111";
    getServerAuthorizationMock.mockResolvedValue(authorizedSession());

    render(await PrivateLayout({ children: <PrivateContent /> }));

    expect(screen.queryByRole("link", { name: "Pipeline de prospecção" })).not.toBeInTheDocument();
    expect(screen.getByText("Conteúdo privado sintético")).toBeInTheDocument();
  });

  it("highlights the import history for an actor with read-only import access", async () => {
    pathnameState.value = "/imports/batches/11111111-1111-4111-8111-111111111111";
    getServerAuthorizationMock.mockResolvedValue(authorizedSession(["imports:read"]));

    render(await PrivateLayout({ children: <PrivateContent /> }));

    expect(screen.getByRole("link", { name: "Importações" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Prospecta, página inicial" })).toHaveAttribute("href", "/inicio");
  });

  it("opens the private guide from navigation for an actor without business-area access", async () => {
    pathnameState.value = "/inicio";
    getServerAuthorizationMock.mockResolvedValue(authorizedSession([]));

    render(await PrivateLayout({ children: <PrivateContent /> }));

    const startLink = screen.getByRole("link", { name: "Início" });
    expect(startLink).toHaveAttribute("href", "/inicio");
    expect(startLink).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Prospecta, página inicial" })).toHaveAttribute("href", "/inicio");
    expect(screen.queryByRole("link", { name: "Leads" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Importações" })).not.toBeInTheDocument();
  });

  it("signs out on the server with the login destination", async () => {
    getServerAuthorizationMock.mockResolvedValue(authorizedSession());

    render(await PrivateLayout({ children: <PrivateContent /> }));

    fireEvent.submit(
      screen.getByRole("button", { name: "Sair" }).closest("form")!,
    );

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledExactlyOnceWith({
        redirectTo: "/login",
      });
    });
  });

  it("opens the compact navigation explicitly and closes it after choosing an area", async () => {
    getServerAuthorizationMock.mockResolvedValue(authorizedSession());
    render(await PrivateLayout({ children: <PrivateContent /> }));

    const menu = screen.getByRole("button", { name: "Abrir menu de navegação" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveAttribute("aria-controls", "private-navigation-links");
    expect(menu).toHaveTextContent("Leads");

    fireEvent.click(menu);
    expect(screen.getByRole("button", { name: "Fechar menu de navegação" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Leads" })).toHaveAccessibleDescription("Empresas e avaliações");

    fireEvent.click(screen.getByRole("link", { name: "Importações" }));
    expect(screen.getByRole("button", { name: "Abrir menu de navegação" })).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the navigation and updates its location when browser history changes areas", async () => {
    getServerAuthorizationMock.mockResolvedValue(authorizedSession());
    const { rerender } = render(await PrivateLayout({ children: <PrivateContent /> }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu de navegação" }));

    pathnameState.value = "/imports/batches";
    rerender(await PrivateLayout({ children: <PrivateContent /> }));

    const menu = screen.getByRole("button", { name: "Abrir menu de navegação" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveTextContent("Importações");
    expect(screen.getByRole("link", { name: "Importações" })).toHaveAttribute("aria-current", "page");

    pathnameState.value = "/leads";
    rerender(await PrivateLayout({ children: <PrivateContent /> }));
    expect(screen.getByRole("button", { name: "Abrir menu de navegação" })).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the menu open for modified clicks and restores focus when choosing the current page", async () => {
    pathnameState.value = "/inicio";
    getServerAuthorizationMock.mockResolvedValue(authorizedSession());
    render(await PrivateLayout({ children: <PrivateContent /> }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu de navegação" }));

    fireEvent.click(screen.getByRole("link", { name: "Leads" }), { ctrlKey: true });
    expect(screen.getByRole("button", { name: "Fechar menu de navegação" })).toHaveAttribute("aria-expanded", "true");

    const currentPage = screen.getByRole("link", { name: "Início" });
    currentPage.focus();
    fireEvent.click(currentPage);
    expect(screen.getByRole("button", { name: "Abrir menu de navegação" })).toHaveFocus();
  });

  it("keeps authenticated help available and highlights its own route", async () => {
    pathnameState.value = "/ajuda";
    getServerAuthorizationMock.mockResolvedValue(authorizedSession([]));

    render(await PrivateLayout({ children: <PrivateContent /> }));

    expect(screen.getByRole("link", { name: "Ajuda" })).toHaveAttribute("href", "/ajuda");
    expect(screen.getByRole("link", { name: "Ajuda" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Início" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("link", { name: "Importações" })).not.toBeInTheDocument();
  });

  it("identifies the existing synthetic read-only demonstration explicitly", async () => {
    isDemoDataEnabledMock.mockReturnValue(true);
    getServerAuthorizationMock.mockResolvedValue(authorizedSession(["leads:read"]));

    render(await PrivateLayout({ children: <PrivateContent /> }));

    expect(screen.getByRole("status", { name: "Ambiente de demonstração" })).toHaveTextContent("Demonstração com dados fictícios. Disponível somente para consulta.");
    expect(screen.queryByRole("link", { name: "Importações" })).not.toBeInTheDocument();
  });

  it("does not label a non-synthetic runtime as demonstration data", async () => {
    getServerAuthorizationMock.mockResolvedValue(authorizedSession());

    render(await PrivateLayout({ children: <PrivateContent /> }));

    expect(isDemoDataEnabledMock).toHaveBeenCalledExactlyOnceWith();
    expect(screen.queryByRole("status", { name: "Ambiente de demonstração" })).not.toBeInTheDocument();
  });

  it("explicitly opts private routes out of shared rendering cache", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("keeps private pages and API routes limited to the authorized surfaces", () => {
    const appRoot = resolve(process.cwd(), "src/app");
    const surface = listAppSurface(appRoot, appRoot).sort();

    expect(
      surface.filter((file) => file.startsWith("(private)/")),
    ).toEqual([
      "(private)/ajuda/page.tsx",
      "(private)/costs/page.tsx",
      "(private)/imports/batches/[id]/page.tsx",
      "(private)/imports/batches/page.tsx",
      "(private)/imports/page.tsx",
      "(private)/inicio/page.tsx",
      "(private)/layout.tsx",
      "(private)/leads/[cnpj]/page.tsx",
      "(private)/leads/outside-analysis/[cnpj]/page.tsx",
      "(private)/leads/outside-analysis/page.tsx",
      "(private)/leads/page.tsx",
      "(private)/work-queue/page.tsx",
      "(private)/workspaces/[id]/page.tsx",
    ]);
    expect(surface.filter((file) => file.startsWith("api/"))).toEqual([
      "api/auth/[...nextauth]/route.ts",
      "api/contact-enrichment/callback/route.ts",
      "api/contact-enrichment/route.ts",
      "api/contact-enrichment/v2/[requestId]/reveal/route.ts",
      "api/contact-enrichment/v2/[requestId]/route.ts",
      "api/contact-enrichment/v2/callback/route.ts",
      "api/contact-enrichment/v2/company-search-callback/route.ts",
      "api/contact-enrichment/v2/company-search/[searchRequestId]/route.ts",
      "api/contact-enrichment/v2/company-search/route.ts",
      "api/contact-enrichment/v2/contacts/[contactId]/suppress/route.ts",
      "api/contact-enrichment/v2/retention/route.ts",
      "api/contact-enrichment/v2/reveal-callback/route.ts",
      "api/contact-enrichment/v2/rights/route.ts",
      "api/contact-enrichment/v2/route.ts",
      "api/costs/route.ts",
      "api/imports/[id]/route.ts",
      "api/imports/events/route.ts",
      "api/imports/route.ts",
      "api/leads/[cnpj]/approach-message/route.ts",
      "api/leads/[cnpj]/history/route.ts",
      "api/leads/[cnpj]/location-map/route.ts",
      "api/leads/[cnpj]/route.ts",
      "api/leads/outside-analysis/[cnpj]/route.ts",
      "api/leads/outside-analysis/route.ts",
      "api/leads/route.ts",
      "api/work-queue/route.ts",
      "api/workspaces/[id]/activities/route.ts",
      "api/workspaces/[id]/audit/route.ts",
      "api/workspaces/[id]/notes/route.ts",
      "api/workspaces/[id]/qualification-cadence/route.ts",
      "api/workspaces/[id]/route.ts",
      "api/workspaces/route.ts",
    ]);
    expect(
      surface.filter((file) => file.startsWith("(private)/workspaces/")),
    ).toEqual(["(private)/workspaces/[id]/page.tsx"]);
  });
});
