import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Cloud Task Adapter & Multi-User Personal Channel Registry", () => {
  it("provides fetchRemoteTasks, syncRemoteTasks and normalizes personal space slugs", async () => {
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
    assert.equal(normalizeChannel("mis-proyectos"), "personal-proyectos");
    assert.equal(normalizeChannel("notas-ideas"), "personal-notas");
  });

  it("blocks private workspace reads/writes when userId is null across all personal spaces", async () => {
    const { fetchRemoteTasks, syncRemoteTasks } = await import(
      "../src/infrastructure/cloudTaskAdapter.mjs"
    );

    for (const priv of ["personal", "personal-proyectos", "personal-notas"]) {
      const unauthRead = await fetchRemoteTasks(priv, null);
      assert.equal(unauthRead.ok, true);
      assert.deepEqual(unauthRead.tasks, []);

      const unauthSync = await syncRemoteTasks(priv, [{ title: "Privada" }], null, { immediate: true });
      assert.equal(unauthSync, false);
    }
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

  it("isolates real Google users with clean personal spaces without demo preset clutter (BDD-CS-008)", async () => {
    const {
      DEFAULT_CHANNELS,
      PERSONAL_CHANNEL,
      loadActiveChannelId,
      loadChannels,
      isDemoProfileId
    } = await import("../src/infrastructure/channelStore.mjs");

    assert.equal(PERSONAL_CHANNEL.id, "personal");
    assert.equal(PERSONAL_CHANNEL.isPrivate, true);
    assert.equal(DEFAULT_CHANNELS[0].id, "personal");
    assert.equal(DEFAULT_CHANNELS[0].label, "Mi Día (Privado)");
    assert.equal(loadActiveChannelId("usr_g_1"), "personal");

    assert.equal(isDemoProfileId("usr_valentin"), true);
    assert.equal(isDemoProfileId("usr_g_100470499712704597932"), false);

    const googleUserSpaces = loadChannels("usr_g_100470499712704597932");
    assert.equal(googleUserSpaces.length, 3);
    assert.deepEqual(
      googleUserSpaces.map((c) => c.id),
      ["personal", "personal-proyectos", "personal-notas"]
    );
    assert.equal(googleUserSpaces.some((c) => c.kind === "preset"), false);

    const demoSpaces = loadChannels("usr_valentin");
    assert.equal(demoSpaces.some((c) => c.id === "general" && c.kind === "preset"), true);
  });
});
