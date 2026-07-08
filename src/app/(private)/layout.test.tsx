import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getServerAuthorizationMock,
  pathnameState,
  redirectMock,
  signOutMock,
} = vi.hoisted(
  () => ({
    getServerAuthorizationMock: vi.fn(),
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
    getServerAuthorizationMock.mockResolvedValue({
      status: "authorized",
      issuer: "https://identity.internal.test/tenant",
      organizationId: "synthetic-organization",
      subject: "synthetic-subject",
    });

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
    expect(importsLink).toHaveAttribute("href", "/imports");
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
    getServerAuthorizationMock.mockResolvedValue({ status: "authorized" });

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

  it("signs out on the server with the login destination", async () => {
    getServerAuthorizationMock.mockResolvedValue({ status: "authorized" });

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

  it("explicitly opts private routes out of shared rendering cache", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("keeps private pages and API routes limited to the authorized surfaces", () => {
    const appRoot = resolve(process.cwd(), "src/app");
    const surface = listAppSurface(appRoot, appRoot).sort();

    expect(
      surface.filter((file) => file.startsWith("(private)/")),
    ).toEqual([
      "(private)/imports/batches/page.tsx",
      "(private)/imports/page.tsx",
      "(private)/layout.tsx",
      "(private)/leads/[cnpj]/page.tsx",
      "(private)/leads/page.tsx",
    ]);
    expect(surface.filter((file) => file.startsWith("api/"))).toEqual([
      "api/auth/[...nextauth]/route.ts",
      "api/imports/[id]/route.ts",
      "api/imports/route.ts",
      "api/leads/[cnpj]/history/route.ts",
      "api/leads/[cnpj]/route.ts",
      "api/leads/route.ts",
    ]);
    expect(surface.join("\n")).not.toMatch(
      /(?:api\/work-queue|api\/workspaces|\(private\)\/work)/,
    );
  });
});
