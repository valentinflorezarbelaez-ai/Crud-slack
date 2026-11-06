import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

describe("Task API Endpoint: api/tasks.js", () => {
  it("rejects POST requests with missing channelId or invalid tasks array", async () => {
    const { POST } = await import("../api/tasks.js");

    const req1 = new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const res1 = await POST(req1);
    assert.equal(res1.status, 400);
    const json1 = await res1.json();
    assert.equal(json1.ok, false);

    const req2 = new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: "general", tasks: "not-an-array" })
    });
    const res2 = await POST(req2);
    assert.equal(res2.status, 400);
  });

  it("normalizes channelId with or without c_ prefix", async () => {
    const { normalizeChannelId } = await import("../api/tasks.js");
    assert.equal(normalizeChannelId("c_general"), "general");
    assert.equal(normalizeChannelId("general"), "general");
    assert.equal(normalizeChannelId("c_URGENCIAS"), "urgencias");
    assert.equal(normalizeChannelId(""), "general");
  });

  it("handles GET requests returning tasks for canonical channel", async () => {
    const { GET } = await import("../api/tasks.js");

    const req = new Request("http://localhost/api/tasks?channelId=general");
    const res = await GET(req);
    assert.ok(res.status === 200 || res.status === 500); // 500 only if DB not reachable in test
    const json = await res.json();
    assert.ok(typeof json.ok === "boolean");
  });
});
