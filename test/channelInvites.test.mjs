import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Task 4: Channel Invites Endpoints", () => {
  it("rejects invite creation without channelId", async () => {
    const { POST: createInvite } = await import("../api/channels/invite.js");

    const req = new Request("http://localhost/api/channels/invite", {
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
    const { GET: joinChannel } = await import("../api/channels/join.js");

    const req = new Request("http://localhost/api/channels/join");
    const res = await joinChannel(req);
    assert.equal(res.status, 400);
  });
});
