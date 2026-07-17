import "server-only";

export function isDemoDataEnabled(
  input: Record<string, string | undefined> = process.env,
): boolean {
  return input.FEATURE_DEMO_DATA_ENABLED === "true";
}

/**
 * The disposable Demo 2 producer marks its runs as test data. Its lead
 * readers may include those rows only inside the explicitly approved Demo 2
 * runtime. This is server-only configuration; it is never request controlled.
 */
export function isDemo2TestRunVisibilityEnabled(
  input: Record<string, string | undefined> = process.env,
): boolean {
  return (
    input.DEMO2_FULL_ACCESS_ENABLED === "true" &&
    input.AUTH_DEV_BYPASS_ENABLED === "true" &&
    input.FEATURE_DEMO_DATA_ENABLED !== "true" &&
    (input.NODE_ENV === "development" ||
      input.DEMO2_K8S_RUNTIME_ENABLED === "true")
  );
}
