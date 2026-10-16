import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  PrivateCapabilitiesProvider,
  usePrivateCapabilities,
} from "./private-capabilities";

function CapabilityProbe() {
  const { hasPermission } = usePrivateCapabilities();
  return (
    <p>
      {hasPermission("commercial:write") ? "Pode editar" : "Somente leitura"}
    </p>
  );
}

describe("private client capabilities", () => {
  it("denies a missing provider by default", () => {
    render(<CapabilityProbe />);
    expect(screen.getByText("Somente leitura")).toBeInTheDocument();
  });

  it("exposes only the exact server-derived permissions", () => {
    render(
      <PrivateCapabilitiesProvider permissions={["commercial:write"]}>
        <CapabilityProbe />
      </PrivateCapabilitiesProvider>,
    );
    expect(screen.getByText("Pode editar")).toBeInTheDocument();
  });
});
