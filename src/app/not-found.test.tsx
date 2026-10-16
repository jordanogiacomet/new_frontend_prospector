import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NotFound from "./not-found";

describe("unknown application route", () => {
  it("explains the missing page in Portuguese and provides safe navigation", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { name: "Página não encontrada" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao início" })).toHaveAttribute("href", "/inicio");
    expect(screen.getByRole("link", { name: "Consultar ajuda" })).toHaveAttribute("href", "/ajuda");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/This page could not be found|workflow|n8n/i);
  });
});
