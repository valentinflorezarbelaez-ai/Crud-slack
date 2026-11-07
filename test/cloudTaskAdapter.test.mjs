import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Cloud Task Adapter & Personal Channel Registry", () => {
  it("provides fetchRemoteTasks, syncRemoteTasks and normalizes mi-dia to personal", async () => {
    const { fetchRemoteTasks, syncRemoteTasks, normalizeChannel } = await import(
      "../src/infrastructure/cloudTaskAdapter.mjs"
    );
    assert.equal(typeof fetchRemoteTasks, "function");
    assert.equal(typeof syncRemoteTasks, "function");
    assert.equal(typeof normalizeChannel, "function");

    assert.equal(normalizeChannel("c_general"), "general");
    assert.equal(normalizeChannel("general"), "general");
    assert.equal(normalizeChannel("c_proyectos"), "proyectos");
    assert.equal(normalizeChannel("mi-dia"), "personal");
  });

  it("blocks private workspace reads/writes when userId is null (BDD-CS-006/007)", async () => {
    const { fetchRemoteTasks, syncRemoteTasks } = await import(
      "../src/infrastructure/cloudTaskAdapter.mjs"
    );
    const unauthRead = await fetchRemoteTasks("personal", null);
    assert.equal(unauthRead.ok, true);
    assert.deepEqual(unauthRead.tasks, []);

    const unauthSync = await syncRemoteTasks("personal", [{ title: "Privada" }], null, { immediate: true });
    assert.equal(unauthSync, false);
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

  it("registers Mi Día (Privado) as the canonical personal workspace in channelStore", async () => {
    const { DEFAULT_CHANNELS, PERSONAL_CHANNEL, loadActiveChannelId } = await import(
      "../src/infrastructure/channelStore.mjs"
    );
    assert.equal(PERSONAL_CHANNEL.id, "personal");
    assert.equal(PERSONAL_CHANNEL.isPrivate, true);
    assert.equal(DEFAULT_CHANNELS[0].id, "personal");
    assert.equal(DEFAULT_CHANNELS[0].label, "Mi Día (Privado)");
    assert.equal(loadActiveChannelId(), "personal");
  });
});
