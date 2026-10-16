import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalChild, serverSettingNames, syntheticEnvironment } from "./lib/mvp-runtime.mjs";

export function buildEnvironment(repository, input = process.env) {
  const environment = syntheticEnvironment(repository, input);
  for (const name of serverSettingNames(repository)) {
    if (name.startsWith("FEATURE_") || name.startsWith("DEMO")) environment[name] = "false";
  }
  return { ...environment, NODE_ENV: "production", AUTH_DEV_BYPASS_ENABLED: "false" };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const repository = process.cwd();
    const next = resolve(repository, "node_modules/next/dist/bin/next");
    if (!existsSync(next)) throw new Error("DEPENDENCIES_REQUIRED");
    console.log("Build local com configuração sintética e integrações desabilitadas. Não publica nem modifica ambientes externos.");
    runLocalChild({
      args: [next, "build"], cwd: repository,
      environment: buildEnvironment(repository), label: "o build local",
    });
  } catch {
    console.error("Não foi possível preparar o build local. Confira as dependências e a configuração de porta.");
    process.exitCode = 1;
  }
}
