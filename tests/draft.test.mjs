import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { applyEvent, newStates } from "../lib/domain.ts";
const bundle = await build({
  entryPoints: ["lib/draft.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { Draft } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
test("offline queue survives reload, lost replies and concurrent edits without losing changes", async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  };
  const initial = {
    id: "attempt",
    userId: "user",
    bankId: "bank",
    title: "test",
    status: "active",
    questions: [{ id: "q" }],
    states: newStates(1),
    current: 0,
    revision: 0,
  };
  let server = structuredClone(initial);
  const seen = new Set();
  let mode = "offline";
  globalThis.fetch = async (_url, options) => {
    if (mode === "offline") throw new Error("offline");
    const body = JSON.parse(options.body);
    if (body.revision !== server.revision)
      return Response.json({ attempt: server }, { status: 409 });
    for (const event of body.events) {
      if (seen.has(event.id)) continue;
      applyEvent(server.states, event);
      seen.add(event.id);
    }
    server.revision++;
    if (mode === "lost") throw new Error("reply lost");
    return Response.json({
      attempt: server,
      acked: body.events.map((x) => x.id),
    });
  };
  let d = new Draft(initial);
  d.add("answer", 0, "A");
  d.add("answer", 0, "B");
  d.add("answer", 0, "A");
  d.add("time", 0, 3000);
  await assert.rejects(d.sync());
  assert.equal(d.pending.length, 4);
  assert.ok(storage.size);
  d = new Draft(initial);
  assert.deepEqual(d.view().states[0].history, ["A", "B", "A"]);
  mode = "lost";
  await assert.rejects(d.sync());
  assert.equal(server.states[0].elapsedMs, 3000);
  mode = "online";
  await d.sync();
  assert.deepEqual(d.base.states[0].history, ["A", "B", "A"]);
  assert.equal(d.base.states[0].elapsedMs, 3000);
  assert.equal(d.pending.length, 0);
  assert.equal(storage.size, 0);
  d.add("time", 0, 2000);
  d.add("flag", 0, true);
  await Promise.all([d.sync(), d.sync()]);
  assert.equal(server.states[0].elapsedMs, 5000);
  assert.equal(server.states[0].flagged, true);
});
