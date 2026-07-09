import "server-only";

export function isDemoDataEnabled(
  input: Record<string, string | undefined> = process.env,
): boolean {
  return input.FEATURE_DEMO_DATA_ENABLED === "true";
}
