import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LeadViewNavigation } from "./lead-view-navigation";

describe("lead view navigation", () => {
  it("links the two stable lead views", () => {
    render(<LeadViewNavigation activeView="analysis" />);

    expect(
      screen.getByRole("navigation", { name: "Visões de leads" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Para análise" }),
    ).toHaveAttribute("href", "/leads");
    expect(
      screen.getByRole("link", { name: "Fora da análise" }),
    ).toHaveAttribute("href", "/leads/outside-analysis");
  });

  it.each([
    ["analysis", "Para análise", "Fora da análise"],
    ["outside-analysis", "Fora da análise", "Para análise"],
  ] as const)(
    "marks only %s as the current page",
    (activeView, currentLabel, otherLabel) => {
      render(<LeadViewNavigation activeView={activeView} />);

      expect(screen.getByRole("link", { name: currentLabel })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(
        screen.getByRole("link", { name: otherLabel }),
      ).not.toHaveAttribute("aria-current");
    },
  );

  it("uses link navigation instead of tab widget semantics", () => {
    render(<LeadViewNavigation activeView="analysis" />);

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});
