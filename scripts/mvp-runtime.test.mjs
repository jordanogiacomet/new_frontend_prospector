import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { parseServerEnv } from "../src/server/env.ts";
import { checkConfiguration, readRuntimeEnvironment } from "./check-config.mjs";
import { localPort, runLocalChild, serverSettingNames, syntheticEnvironment } from "./lib/mvp-runtime.mjs";
import { prepareStandalone } from "./start-mvp.mjs";
import { buildEnvironment } from "./build-safe.mjs";

const repository = resolve(import.meta.dirname, "..");
const temporary = () => mkdtempSync(resolve(tmpdir(), "prospecta-synthetic-runtime-"));
const sample = () => syntheticEnvironment(repository, {});

test("safe build denies every integration and bypass using only synthetic credentials and loopback databases", () => {
  const inherited = Object.fromEntries(serverSettingNames(repository).map((name) => [name, "private-build-value"]));
  const environment = buildEnvironment(repository, { ...inherited, NODE_OPTIONS: "--require private-hook" });
  const parsed = parseServerEnv(environment);
  assert.equal(environment.NODE_ENV, "production");
  assert.equal(parsed.AUTH_DEV_BYPASS_ENABLED, false);
  for (const name of serverSettingNames(repository).filter((name) => name.startsWith("FEATURE_") || name.startsWith("DEMO"))) {
    assert.equal(parsed[name], false, name);
  }
  for (const name of ["DATABASE_URL", "APP_DATABASE_URL", "PRODUCER_DATABASE_URL"]) {
    const url = new URL(parsed[name]);
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.port, "9");
  }
  assert.equal(environment.NODE_OPTIONS, "");
  assert(!JSON.stringify(environment).includes("private-build-value"));
});

test("safe preview replaces inherited secrets, integration flags, and database targets", () => {
  const inherited = Object.fromEntries(serverSettingNames(repository).map((name) => [name, "private-inherited-value"]));
  const environment = syntheticEnvironment(repository, {
    ...inherited, HOSTNAME: "192.0.2.50", NODE_OPTIONS: "--require private-hook", PROSPECTA_PORT: "3019",
  });
  const parsed = parseServerEnv(environment);
  assert.equal(parsed.FEATURE_DEMO_DATA_ENABLED, true);
  assert.equal(parsed.FEATURE_COMMERCIAL_ENABLED, true);
  assert.equal(parsed.DEMO2_FULL_ACCESS_ENABLED, false);
  assert.equal(parsed.DEMO3_LOCAL_RUNTIME_ENABLED, false);
  for (const name of ["FEATURE_IMPORTS_ENABLED", "FEATURE_BATCH_OBSERVATION_ENABLED", "FEATURE_CONTACT_ENRICHMENT_ENABLED", "FEATURE_CONTACT_DATA_ENABLED", "FEATURE_REGISTERED_ADDRESS_MAP_ENABLED", "FEATURE_AI_APPROACH_ENABLED", "FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED"]) {
    assert.equal(parsed[name], false, name);
  }
  for (const name of ["DATABASE_URL", "APP_DATABASE_URL", "PRODUCER_DATABASE_URL"]) {
    const url = new URL(parsed[name]);
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.port, "9");
  }
  assert.equal(environment.AUTH_URL, "http://127.0.0.1:3019");
  assert.equal(environment.NODE_OPTIONS, "");
  assert.equal(environment.HOSTNAME, undefined);
  assert(!JSON.stringify(environment).includes("private-inherited-value"));
});

test("local port rejects external-bind options and malformed port values", () => {
  for (const port of ["0", "80", "65536", "3012.5", "http://192.0.2.5", ""]) {
    assert.throws(() => localPort(port));
  }
  assert.equal(localPort(undefined), 3000);
});

test("configuration validates shape without exposing invalid secret values", () => {
  const invalid = "https://private-user:private-password@private.example.test/unapproved-path";
  const result = checkConfiguration({ ...sample(), N8N_IMPORT_URL: invalid });
  assert.equal(result.valid, false);
  assert(result.fields.includes("N8N_IMPORT_URL"));
  assert(!JSON.stringify(result).includes("private-password"));
  assert.equal(checkConfiguration(sample()).valid, true);
});

test("configuration rejects publicly named server credentials", () => {
  assert.equal(checkConfiguration({ ...sample(), NEXT_PUBLIC_AUTH_SECRET: "synthetic-public-secret" }).valid, false);
});

test("configuration loader preserves explicit environment over a synthetic local file", () => {
  const directory = temporary();
  try {
    writeFileSync(resolve(directory, ".env.local"), 'AUTH_SECRET="synthetic-file-secret"\nPROSPECTA_PORT="3019"\n', { mode: 0o600 });
    const environment = readRuntimeEnvironment(directory, { AUTH_SECRET: "synthetic-runtime-secret" });
    assert.equal(environment.AUTH_SECRET, "synthetic-runtime-secret");
    assert.equal(environment.PROSPECTA_PORT, "3019");
    assert.equal(environment.NODE_ENV, "production");
    assert.equal(readFileSync(resolve(directory, ".env.local"), "utf8").includes("synthetic-file-secret"), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("configuration CLI fails safely for a missing explicit file or malformed synthetic configuration", () => {
  const directory = temporary();
  try {
    const args = ["--conditions=react-server", resolve(repository, "scripts/check-config.mjs")];
    const missing = spawnSync(process.execPath, [...args, "absent.env"], { cwd: directory, env: sample(), encoding: "utf8" });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Não foi possível ler/);
    const secret = "synthetic-private-password";
    writeFileSync(resolve(directory, "synthetic.env"), `N8N_IMPORT_URL="https://user:${secret}@invalid.example.test/path"\n`);
    const environment = sample();
    delete environment.N8N_IMPORT_URL;
    const invalid = spawnSync(process.execPath, [...args, "synthetic.env"], { cwd: directory, env: environment, encoding: "utf8" });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /N8N_IMPORT_URL/);
    assert(!invalid.stderr.includes(secret));
    const good = spawnSync(process.execPath, args, { cwd: directory, env: sample(), encoding: "utf8" });
    assert.equal(good.status, 0);
    assert.match(good.stdout, /Nenhuma conexão/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("standalone startup requires a build and valid configuration before preparing assets", () => {
  const directory = temporary();
  try {
    assert.throws(() => prepareStandalone(directory, sample()), /BUILD_REQUIRED/);
    mkdirSync(resolve(directory, ".next/standalone"), { recursive: true });
    mkdirSync(resolve(directory, ".next/static"));
    writeFileSync(resolve(directory, ".next/standalone/server.js"), "// synthetic server\n");
    assert.throws(() => prepareStandalone(directory, {}), /CONFIGURATION_INVALID/);
    assert.equal(checkConfiguration({}).valid, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("standalone startup copies built static/public assets, keeps secrets outside artifacts, and fixes loopback host", () => {
  const directory = temporary();
  try {
    mkdirSync(resolve(directory, ".next/standalone"), { recursive: true });
    mkdirSync(resolve(directory, ".next/static"));
    mkdirSync(resolve(directory, "public"));
    writeFileSync(resolve(directory, ".next/standalone/server.js"), "// synthetic server\n");
    writeFileSync(resolve(directory, ".next/static/sample.css"), "body { color: black; }\n");
    writeFileSync(resolve(directory, "public/sample.txt"), "synthetic public content\n");
    writeFileSync(resolve(directory, ".env.local"), 'AUTH_SECRET="synthetic-local-secret-never-copy-into-build"\nPROSPECTA_PORT="3021"\n');
    const environment = sample();
    delete environment.AUTH_SECRET;
    const prepared = prepareStandalone(directory, { ...environment, HOSTNAME: "192.0.2.99" });
    assert.equal(prepared.environment.HOSTNAME, "127.0.0.1");
    assert.equal(prepared.environment.PORT, "3021");
    assert.equal(prepared.environment.NODE_ENV, "production");
    assert.equal(prepared.environment.AUTH_SECRET, "synthetic-local-secret-never-copy-into-build");
    assert.equal(readFileSync(resolve(directory, ".next/standalone/.next/static/sample.css"), "utf8"), "body { color: black; }\n");
    assert.equal(readFileSync(resolve(directory, ".next/standalone/public/sample.txt"), "utf8"), "synthetic public content\n");
    assert.throws(() => readFileSync(resolve(directory, ".next/standalone/.env.local")));
    assert.deepEqual(prepared.args, [resolve(directory, ".next/standalone/server.js")]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("standalone launcher refuses Demo 2/3 runtime grants even when the production parser permits the profile", () => {
  const directory = temporary();
  try {
    mkdirSync(resolve(directory, ".next/standalone"), { recursive: true });
    mkdirSync(resolve(directory, ".next/static"));
    writeFileSync(resolve(directory, ".next/standalone/server.js"), "// synthetic server\n");
    const demo3 = { ...sample(), NODE_ENV: "production", FEATURE_DEMO_DATA_ENABLED: "false", DEMO3_LOCAL_RUNTIME_ENABLED: "true" };
    assert.equal(checkConfiguration(demo3).valid, true);
    assert.throws(() => prepareStandalone(directory, demo3), /LOCAL_RUNTIME_FORBIDDEN/);
    const demo2 = { ...sample(), NODE_ENV: "production", FEATURE_DEMO_DATA_ENABLED: "false", DEMO2_FULL_ACCESS_ENABLED: "true", DEMO2_K8S_RUNTIME_ENABLED: "true" };
    assert.equal(checkConfiguration(demo2).valid, true);
    assert.throws(() => prepareStandalone(directory, demo2), /LOCAL_RUNTIME_FORBIDDEN/);
    assert.throws(() => prepareStandalone(directory, { ...sample(), FEATURE_DEMO_DATA_ENABLED: "false" }), /CONFIGURATION_INVALID/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("launcher forwards interrupt only to its child and removes signal handlers on exit", () => {
  const host = Object.assign(new EventEmitter(), { execPath: process.execPath, exitCode: undefined });
  const child = new EventEmitter();
  const signals = [];
  child.kill = (signal) => signals.push(signal);
  runLocalChild({ args: ["synthetic-server.js"], cwd: "/synthetic", environment: {}, label: "a amostra", hostProcess: host, spawnProcess: () => child });
  host.emit("SIGINT");
  assert.deepEqual(signals, ["SIGINT"]);
  child.emit("exit", null, "SIGINT");
  assert.equal(host.exitCode, 130);
  assert.equal(host.listenerCount("SIGINT"), 0);
  assert.equal(host.listenerCount("SIGTERM"), 0);
});
