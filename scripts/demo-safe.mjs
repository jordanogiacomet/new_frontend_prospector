import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { localPort, runLocalChild, syntheticEnvironment } from "./lib/mvp-runtime.mjs";

try {
  const repository = process.cwd();
  const next = resolve(repository, "node_modules/next/dist/bin/next");
  if (!existsSync(next)) throw new Error("Execute pnpm install --frozen-lockfile primeiro.");
  const environment = syntheticEnvironment(repository);
  const port = localPort(process.env.PROSPECTA_PORT, 3012);
  console.log(`Prospecta sintético em http://127.0.0.1:${port}/inicio: consulta de exemplos, sem importação ou integrações.`);
  runLocalChild({
    args: [next, "dev", "--hostname", "127.0.0.1", "--port", String(port)],
    cwd: repository, environment, label: "a demonstração sintética",
  });
} catch {
  console.error("Não foi possível preparar a demonstração. Instale as dependências e confira PROSPECTA_PORT (1024–65535).");
  process.exitCode = 1;
}
