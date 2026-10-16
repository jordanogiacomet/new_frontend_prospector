import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import GlobalError from "./global-error";

describe("global application fallback", () => {
  it("owns its document language and styling when the root layout fails", () => {
    const reset = vi.fn();
    const markup = renderToStaticMarkup(<GlobalError error={new Error("synthetic-private-root-error")} reset={reset} />);

    expect(markup).toMatch(/<html[^>]*lang="pt-BR"/);
    expect(markup).toMatch(/<body[^>]*style=/);
    expect(markup).toContain("Não foi possível abrir esta página");
    expect(markup).toContain("Tentar abrir novamente");
    expect(markup).toContain("href=\"/inicio\"");
    expect(markup).not.toContain("synthetic-private-root-error");
    expect(reset).not.toHaveBeenCalled();
  });

  it("ignores sensitive message, digest and stack getters", () => {
    const error = new Error("synthetic-error");
    const read = vi.fn(() => "synthetic-sensitive-value");
    for (const name of ["message", "digest", "stack"]) {
      Object.defineProperty(error, name, { get: read });
    }

    const markup = renderToStaticMarkup(<GlobalError error={error} reset={vi.fn()} />);

    expect(markup).not.toContain("synthetic-sensitive-value");
    expect(read).not.toHaveBeenCalled();
  });
});
