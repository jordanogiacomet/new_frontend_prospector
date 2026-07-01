import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("test toolchain", () => {
  it("renders a synthetic React component", () => {
    render(<h1>Ambiente de testes ativo</h1>);

    expect(
      screen.getByRole("heading", { name: "Ambiente de testes ativo" }),
    ).toBeInTheDocument();
  });
});
