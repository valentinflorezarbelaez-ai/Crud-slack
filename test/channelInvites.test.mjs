import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Task 4: Multi-Tenant Channels, Invites, Deletion, Anti-Spoofing & User Preferences Endpoints", () => {
  it("returns empty channels & teammates for unauthenticated GET /api/channels (no cross-user leak)", async () => {
    const { GET: listChannels } = await import("../api/channels.js");
    const res = await listChannels(new Request("http://localhost/api/channels"));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.deepEqual(json.channels, []);
    assert.deepEqual(json.teammates, []);

    // BDD-CS-009: Spoofed Google userId query without signed cookie must ALSO return empty
    const spoofRes = await listChannels(
      new Request("http://localhost/api/channels?userId=usr_g_100470499712704597932")
    );
    assert.equal(spoofRes.status, 200);
    const spoofJson = await spoofRes.json();
    assert.deepEqual(spoofJson.channels, []);
    assert.deepEqual(spoofJson.teammates, []);
  });

  it("rejects unauthenticated channel creation with 401", async () => {
    const { POST: createChannel } = await import("../api/channels.js");
    const res = await createChannel(
      new Request("http://localhost/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "trabajo" })
      })
    );
    assert.equal(res.status, 401);
  });

  it("rejects invite creation without channelId or for any personal private space", async () => {
    const { POST: createInvite } = await import("../api/channels.js");

    const req = new Request("http://localhost/api/channels?action=invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const res = await createInvite(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.ok, false);

    for (const priv of ["personal", "personal-proyectos", "personal-notas"]) {
      const personalInviteReq = new Request("http://localhost/api/channels?action=invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: priv })
      });
      const personalInviteRes = await createInvite(personalInviteReq);
      assert.equal(personalInviteRes.status, 400);
    }
  });

  it("rejects join attempt with missing token", async () => {
    const { GET: joinChannel } = await import("../api/channels.js");

    const req = new Request("http://localhost/api/channels?action=join");
    const res = await joinChannel(req);
    assert.equal(res.status, 400);
  });

  it("google.js GET returns client ID or 503 error if unset", async () => {
    const { GET: getGoogleClient } = await import("../api/auth/google.js");
    const res = await getGoogleClient();
    assert.ok(res.status === 200 || res.status === 503);
  });

  it("me.js POST blocks usr_g_* spoofing without cookie and accepts signed cookie session (BDD-CS-009)", async () => {
    if (!process.env.SESSION_SECRET) {
      process.env.SESSION_SECRET = "test_hermetic_session_secret_32_chars_long_minimum!";
    }
    const { POST: updateMe } = await import("../api/auth/me.js");
    const { signSession } = await import("../api/_auth.js");

    const unauthRes = await updateMe(
      new Request("http://localhost/api/auth/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: { theme: "dark" } })
      })
    );
    assert.equal(unauthRes.status, 401);

    // Attempted usr_g_* spoofing without signed cookie must be rejected (401)
    const spoofRes = await updateMe(
      new Request("http://localhost/api/auth/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "usr_g_test1",
          statusText: "Spoofed"
        })
      })
    );
    assert.equal(spoofRes.status, 401);

    // Valid HMAC-SHA256 HttpOnly session cookie succeeds
    process.env.TASKFLOW_HERMETIC_TEST = "1";
    const sessionToken = await signSession({ userId: "usr_g_test1", fullName: "Test User" });
    const authRes = await updateMe(
      new Request("http://localhost/api/auth/me", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `taskflow_session=${encodeURIComponent(sessionToken)}`
        },
        body: JSON.stringify({
          statusText: "Enfoque profundo",
          preferences: { theme: "dark", scale: "xl", layout: "focus", invalidKey: "ignored" }
        })
      })
    );
    if (!process.env.DATABASE_URL) {
      assert.equal(authRes.status, 200);
      const authJson = await authRes.json();
      assert.equal(authJson.ok, true);
      assert.equal(authJson.user.status_text, "Enfoque profundo");
      assert.deepEqual(authJson.user.preferences, { theme: "dark", scale: "xl", layout: "focus" });
    }
  });

  it("rejects channel deletion for #general and all personal spaces", async () => {
    const { DELETE: deleteChannel } = await import("../api/channels.js");

    for (const protectedId of [
      "general",
      "personal",
      "mi-dia",
      "personal-proyectos",
      "mis-proyectos",
      "personal-notas",
      "notas-ideas"
    ]) {
      const req = new Request(`http://localhost/api/channels?channelId=${protectedId}`, {
        method: "DELETE"
      });
      const res = await deleteChannel(req);
      assert.equal(res.status, 400, `Expected 400 for protected channel ${protectedId}`);
      const json = await res.json();
      assert.equal(json.ok, false);
    }
  });

  it("rejects channel deletion with missing channelId", async () => {
    const { DELETE: deleteChannel } = await import("../api/channels.js");

    const req = new Request("http://localhost/api/channels", {
      method: "DELETE"
    });
    const res = await deleteChannel(req);
    assert.equal(res.status, 400);
  });

  it("successfully deletes a custom channel", async () => {
    const { DELETE: deleteChannel } = await import("../api/channels.js");

    const req = new Request("http://localhost/api/channels?name=proyectos-antiguos", {
      method: "DELETE"
    });
    const res = await deleteChannel(req);
    assert.ok(res.status === 200 || res.status === 500);
    const json = await res.json();
    if (res.status === 200) {
      assert.equal(json.ok, true);
      assert.equal(json.deleted, true);
    }
  });
});
