import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkConfiguration, readRuntimeEnvironment } from "./check-config.mjs";
import { localPort, runLocalChild } from "./lib/mvp-runtime.mjs";

export function prepareStandalone(repository, input = process.env) {
  const standalone = resolve(repository, ".next/standalone");
  const server = resolve(standalone, "server.js");
  const staticFiles = resolve(repository, ".next/static");
  if (!existsSync(server) || !existsSync(staticFiles)) {
    throw new Error("BUILD_REQUIRED");
  }
  let environment = { ...input, NODE_ENV: "production" };
  if (existsSync(resolve(repository, ".env.local"))) {
    environment = readRuntimeEnvironment(repository, environment);
  }
  if (!checkConfiguration(environment).valid) throw new Error("CONFIGURATION_INVALID");
  if (["DEMO2_FULL_ACCESS_ENABLED", "DEMO2_K8S_RUNTIME_ENABLED", "DEMO3_LOCAL_RUNTIME_ENABLED"].some((name) => environment[name] === "true")) {
    throw new Error("LOCAL_RUNTIME_FORBIDDEN");
  }
  if (environment.AUTH_DEV_BYPASS_ENABLED === "true" && environment.FEATURE_DEMO_DATA_ENABLED !== "true") {
    throw new Error("LOCAL_RUNTIME_FORBIDDEN");
  }
  const port = localPort(environment.PROSPECTA_PORT);
  cpSync(staticFiles, resolve(standalone, ".next/static"), { recursive: true });
  if (existsSync(resolve(repository, "public"))) {
    cpSync(resolve(repository, "public"), resolve(standalone, "public"), { recursive: true });
  }
  return {
    args: [server],
    cwd: standalone,
    environment: { ...environment, HOSTNAME: "127.0.0.1", PORT: String(port) },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const prepared = prepareStandalone(process.cwd());
    console.log(`Prospecta local em http://127.0.0.1:${prepared.environment.PORT}/inicio`);
    runLocalChild({ ...prepared, label: "o Prospecta" });
  } catch (error) {
    console.error(error instanceof Error && error.message === "BUILD_REQUIRED"
      ? "Build não encontrado. Execute pnpm build antes de pnpm start."
      : "Não foi possível iniciar. Execute pnpm check:config e confira PROSPECTA_PORT.");
    process.exitCode = 1;
  }
}
