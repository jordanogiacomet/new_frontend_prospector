import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./deploy-demo3-k8s.mjs", import.meta.url), "utf8");
const lockSource = source.slice(source.indexOf("function fail("), source.indexOf("function required("));

function systemError(code) {
  return Object.assign(new Error(`Synthetic ${code}`), { code });
}

function syntheticLock({ existingPid, probeError, creationError } = {}) {
  const path = "/synthetic/prospecta-demo3-deploy.lock";
  const calls = [];
  let contents = existingPid;
  let onExit;
  const acquire = runInNewContext(`${lockSource}\nacquireDeploymentLock`, {
    Error,
    deploymentLockFile: path,
    readFileSync(file, encoding) {
      calls.push(["read", file, encoding]);
      if (contents === undefined) throw systemError("ENOENT");
      return contents;
    },
    rmSync(file, options) {
      calls.push(["remove", file, options]);
      contents = undefined;
    },
    openSync(file, flags, mode) {
      calls.push(["open", file, flags, mode]);
      if (creationError !== undefined) throw systemError(creationError);
      assert.equal(contents, undefined);
      return 71;
    },
    writeFileSync(descriptor, value) {
      calls.push(["write", descriptor, value]);
      contents = value;
    },
    closeSync(descriptor) {
      calls.push(["close", descriptor]);
    },
    process: {
      pid: 900001,
      kill(pid, signal) {
        calls.push(["probe", pid, signal]);
        if (probeError !== undefined) throw systemError(probeError);
      },
      once(event, callback) {
        calls.push(["listen", event]);
        onExit = callback;
      },
    },
  });
  return { acquire, calls, contents: () => contents, exit: () => onExit?.() };
}

test("live deployment PID prevents acquisition without removing or replacing its lock", () => {
  const lock = syntheticLock({ existingPid: "800001" });
  assert.throws(lock.acquire, /another deployment process is already active/);
  assert.deepEqual(lock.calls.map(([operation]) => operation), ["read", "probe"]);
  assert.equal(lock.contents(), "800001");
});

test("only ESRCH permits replacing a stale lock and the owner releases its new lock once", () => {
  const lock = syntheticLock({ existingPid: "800001", probeError: "ESRCH" });
  lock.acquire();
  assert.equal(lock.contents(), "900001");
  assert.deepEqual(lock.calls.find(([operation]) => operation === "open"), ["open", "/synthetic/prospecta-demo3-deploy.lock", "wx", 0o600]);
  lock.exit();
  lock.exit();
  assert.equal(lock.contents(), undefined);
  assert.equal(lock.calls.filter(([operation]) => operation === "close").length, 1);
  assert.equal(lock.calls.filter(([operation]) => operation === "remove").length, 2);
});

test("an unreadable live-process probe fails closed and preserves the other lock", () => {
  const lock = syntheticLock({ existingPid: "800001", probeError: "EPERM" });
  assert.throws(lock.acquire, { code: "EPERM" });
  assert.deepEqual(lock.calls.map(([operation]) => operation), ["read", "probe"]);
  assert.equal(lock.contents(), "800001");
});

test("a missing lock is exclusively created without inspecting another process", () => {
  const lock = syntheticLock();
  lock.acquire();
  assert.equal(lock.contents(), "900001");
  assert.deepEqual(lock.calls.map(([operation]) => operation), ["read", "open", "write", "listen"]);
});

test("a competing exclusive creator prevents writing or registering cleanup", () => {
  const lock = syntheticLock({ creationError: "EEXIST" });
  assert.throws(lock.acquire, /another deployment process acquired the deployment lock/);
  assert.deepEqual(lock.calls.map(([operation]) => operation), ["read", "open"]);
});
