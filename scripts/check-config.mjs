import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

import { parseServerEnv } from "../src/server/env.ts";
import { serverSettingNames } from "./lib/mvp-runtime.mjs";

const allowedIssueFields = new Set(serverSettingNames(resolve(import.meta.dirname, "..")));

export function readRuntimeEnvironment(repository, environment = process.env, filename) {
  const path = resolve(repository, filename ?? ".env.local");
  if (filename !== undefined || existsSync(path)) {
    const file = readFileSync(path, "utf8");
    return { ...parseEnv(file), ...environment, NODE_ENV: environment.NODE_ENV ?? "production" };
  }
  return { ...environment, NODE_ENV: environment.NODE_ENV ?? "production" };
}

export function checkConfiguration(environment) {
  try {
    parseServerEnv(environment);
    return { valid: true, fields: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const fields = [...new Set(message.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [])]
      .filter((name) => allowedIssueFields.has(name));
    return { valid: false, fields };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    if (process.argv.length > 3) throw new Error("Unsupported arguments");
    const result = checkConfiguration(readRuntimeEnvironment(process.cwd(), process.env, process.argv[2]));
    if (!result.valid) {
      console.error(`Configuração inválida. Revise ${result.fields.join(", ") || "os grupos do servidor"}.`);
      process.exitCode = 1;
    } else {
      console.log("Formato da configuração válido. Nenhuma conexão, credencial remota ou aprovação de ambiente foi verificada.");
    }
  } catch {
    console.error("Não foi possível ler a configuração. Informe um arquivo local confiável; seus valores não são exibidos.");
    process.exitCode = 1;
  }
}
