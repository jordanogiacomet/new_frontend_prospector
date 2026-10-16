import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("private page navigation loading", () => {
  it("announces navigation without inventing upload or analysis progress", () => {
    render(<Loading />);

    expect(screen.getByRole("status", { name: "Carregando página" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/\d+%|Concluído|Falhou|Processando CSV|0 empresas/i);
  });
});
