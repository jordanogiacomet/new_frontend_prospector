import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServerAuthorizationMock, redirectMock, signInMock } = vi.hoisted(
  () => ({
    getServerAuthorizationMock: vi.fn(),
    redirectMock: vi.fn(),
    signInMock: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));

vi.mock("../../server/auth", () => ({
  getServerAuthorization: getServerAuthorizationMock,
  signIn: signInMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import LoginPage from "./page";

describe("login page", () => {
  beforeEach(() => {
    getServerAuthorizationMock.mockReset();
    getServerAuthorizationMock.mockResolvedValue({ status: "missing" });
    redirectMock.mockReset();
    signInMock.mockReset();
  });

  it("shows corporate access without exposing lead data", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { name: "Acesso corporativo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Entrar com acesso corporativo" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /leads? analisados?|empresas analisadas|oportunidades disponíveis|\b\d+\s+(leads?|empresas|oportunidades)\b/i,
    );
  });

  it("starts only the approved provider flow with the leads destination", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    fireEvent.submit(
      screen
        .getByRole("button", { name: "Entrar com acesso corporativo" })
        .closest("form")!,
    );

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledTimes(1);
    });
    expect(signInMock).toHaveBeenCalledWith("organization-oidc", {
      redirectTo: "/leads",
    });
  });

  it("redirects an already authorized session to the leads page", async () => {
    getServerAuthorizationMock.mockResolvedValue({ status: "authorized" });
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      LoginPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/leads");
  });

  it("replaces internal authentication errors with safe generic copy", async () => {
    const internalError =
      "OAuthCallbackError issuer=https://identity.internal.test claim=org_id token=secret";

    render(
      await LoginPage({
        searchParams: Promise.resolve({ error: internalError }),
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível concluir o acesso. Tente novamente ou contate o suporte responsável.",
    );
    expect(document.body).not.toHaveTextContent(internalError);
    expect(document.body).not.toHaveTextContent(/OAuthCallbackError|org_id|token=secret/i);
  });
});
