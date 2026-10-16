import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ApplicationError from "./error";

describe("application error recovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows a safe business fallback without reading or logging the error", () => {
    const error = new Error("synthetic-private-database-value");
    const readMessage = vi.fn(() => "synthetic-private-database-value");
    Object.defineProperty(error, "message", { get: readMessage });
    Object.defineProperty(error, "digest", { get: readMessage });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    render(<ApplicationError error={error} reset={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível abrir esta página");
    expect(document.body).not.toHaveTextContent("synthetic-private-database-value");
    expect(document.body).not.toHaveTextContent(/stack|digest|SQL|n8n/i);
    expect(readMessage).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("recovers only after a human action and never resubmits an upload", () => {
    const reset = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    render(<ApplicationError error={new Error("synthetic-error")} reset={reset} />);

    expect(reset).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tentar abrir novamente" }));
    expect(reset).toHaveBeenCalledExactlyOnceWith();
    expect(fetch).not.toHaveBeenCalled();
  });

});
