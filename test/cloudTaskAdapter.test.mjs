import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Cloud Task Adapter: src/infrastructure/cloudTaskAdapter.mjs", () => {
  it("provides fetchRemoteTasks and syncRemoteTasks functions", async () => {
    const { fetchRemoteTasks, syncRemoteTasks, normalizeChannel } = await import(
      "../src/infrastructure/cloudTaskAdapter.mjs"
    );
    assert.equal(typeof fetchRemoteTasks, "function");
    assert.equal(typeof syncRemoteTasks, "function");
    assert.equal(typeof normalizeChannel, "function");

    assert.equal(normalizeChannel("c_general"), "general");
    assert.equal(normalizeChannel("general"), "general");
    assert.equal(normalizeChannel("c_proyectos"), "proyectos");
  });

  it("safely falls back to local storage when fetch is unavailable in node", async () => {
    const { fetchRemoteTasks, syncRemoteTasks } = await import(
      "../src/infrastructure/cloudTaskAdapter.mjs"
    );
    const result = await fetchRemoteTasks("general");
    assert.equal(result.ok, true);
    assert.equal(result.source, "local");
    assert.ok(Array.isArray(result.tasks));

    const syncOk = await syncRemoteTasks("general", [{ title: "Test task" }], null, { immediate: true });
    assert.equal(syncOk, true);
  });
});
