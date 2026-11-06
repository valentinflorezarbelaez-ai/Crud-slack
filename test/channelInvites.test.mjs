import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Task 4: Channel Invites & Auth Consolidation Endpoints", () => {
  it("rejects invite creation without channelId", async () => {
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
});
