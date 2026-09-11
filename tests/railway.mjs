import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const directory = await mkdtemp(join(tmpdir(), "govtest-test-"));
const password = randomBytes(24).toString("base64url");
const salt = randomBytes(16).toString("hex");
const hash = `scrypt$${salt}$${scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 67108864 }).toString("hex")}`;
const env = {
  ...process.env,
  DATA_DIR: directory,
  INITIAL_ADMIN_USERNAME: "qa-owner",
  INITIAL_ADMIN_PASSWORD_HASH: hash,
  COOKIE_SECURE: "false",
  APP_URL: "http://127.0.0.1:8788",
  TEST_ADMIN_PASSWORD: password,
};
delete env.RAILWAY_ENVIRONMENT_ID;
let server;
async function start() {
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "8788",
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  server.stdout.on("data", (chunk) => (output += chunk));
  server.stderr.on("data", (chunk) => (output += chunk));
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try {
      const r = await fetch(env.APP_URL + "/api/health");
      if (r.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Server did not become ready: " + output);
}
async function stop() {
  if (server && server.exitCode === null) {
    const closed = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await closed;
  }
}
try {
  await start();
  const test = spawn(process.execPath, ["tests/integration.mjs"], {
    env,
    stdio: "inherit",
  });
  const code = await new Promise((resolve) => test.once("exit", resolve));
  assert.equal(code, 0, "integration suite");
  const login = await fetch(env.APP_URL + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "qa-owner", password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const before = await (
    await fetch(env.APP_URL + "/api/admin/users", {
      headers: { Cookie: cookie },
    })
  ).json();
  await stop();
  // A changed bootstrap password must never reset an existing administrator.
  env.INITIAL_ADMIN_PASSWORD_HASH = "";
  await start();
  const after = await fetch(env.APP_URL + "/api/admin/users", {
    headers: { Cookie: cookie },
  });
  assert.equal(after.status, 200, "session survives a process restart");
  assert.deepEqual(
    await after.json(),
    before,
    "users and roles survive a process restart",
  );
  const results = await (
    await fetch(env.APP_URL + "/api/results?scope=all", {
      headers: { Cookie: cookie },
    })
  ).json();
  assert.equal(
    results.length,
    2,
    "submitted results survive a process restart",
  );
  console.log(
    "Passed restart persistence checks: account, session, roles and results.",
  );
} finally {
  await stop();
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith("govtest-test-")
  )
    throw new Error("Unexpected test directory");
  await rm(directory, { recursive: true, force: true });
}
