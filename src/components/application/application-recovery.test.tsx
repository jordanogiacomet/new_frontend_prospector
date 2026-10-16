import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApplicationRecovery } from "./application-recovery";

describe("shared application recovery navigation", () => {
  it("provides keyboard-accessible guarded routes and explains interrupted CSV submission", () => {
    render(<ApplicationRecovery title="Consulta interrompida" description="Descrição sintética." interruptedSubmission reset={vi.fn()} />);

    const startLink = screen.getByRole("link", { name: "Voltar ao início" });
    const helpLink = screen.getByRole("link", { name: "Consultar ajuda" });
    expect(startLink).toHaveAttribute("href", "/inicio");
    expect(helpLink).toHaveAttribute("href", "/ajuda");
    startLink.focus();
    expect(startLink).toHaveFocus();
    helpLink.focus();
    expect(helpLink).toHaveFocus();
    expect(document.body).toHaveTextContent("consulte as importações registradas antes de enviar novamente");
  });
});
