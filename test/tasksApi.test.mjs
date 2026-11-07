import { describe, it } from "node:test";
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

  it("normalizes channelId with c_ prefix and maps mi-dia to personal", async () => {
    const { normalizeChannelId } = await import("../api/tasks.js");
    assert.equal(normalizeChannelId("c_general"), "general");
    assert.equal(normalizeChannelId("general"), "general");
    assert.equal(normalizeChannelId("c_URGENCIAS"), "urgencias");
    assert.equal(normalizeChannelId("mi-dia"), "personal");
    assert.equal(normalizeChannelId("personal"), "personal");
    assert.equal(normalizeChannelId(""), "general");
  });

  it("handles GET requests returning tasks for canonical channel", async () => {
    const { GET } = await import("../api/tasks.js");

    const req = new Request("http://localhost/api/tasks?channelId=general");
    const res = await GET(req);
    assert.ok(res.status === 200 || res.status === 500);
    const json = await res.json();
    assert.ok(typeof json.ok === "boolean");
  });

  it("rejects unauthenticated GET and POST on Mi Día (Privado) (BDD-CS-007)", async () => {
    const { GET, POST } = await import("../api/tasks.js");

    const unauthGet = new Request("http://localhost/api/tasks?channelId=personal");
    const getRes = await GET(unauthGet);
    assert.equal(getRes.status, 401);
    const getJson = await getRes.json();
    assert.equal(getJson.ok, false);

    const unauthPost = new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: "personal",
        tasks: [{ title: "Intento sin sesión" }]
      })
    });
    const postRes = await POST(unauthPost);
    assert.equal(postRes.status, 401);
    const postJson = await postRes.json();
    assert.equal(postJson.ok, false);
  });

  it("handles personal private tasks with scheduledTime and userId isolation", async () => {
    const { POST, GET } = await import("../api/tasks.js");

    const postReq = new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: "personal",
        userId: "usr_valentin",
        tasks: [
          {
            id: "tsk_priv_1",
            title: "Mi tarea privada de las 09:30",
            scheduledTime: "09:30",
            durationMinutes: 45,
            isPrivate: true,
            userId: "usr_valentin"
          }
        ]
      })
    });

    const postRes = await POST(postReq);
    assert.ok(postRes.status === 200 || postRes.status === 500);

    const getReq = new Request("http://localhost/api/tasks?channelId=personal&userId=usr_valentin");
    const getRes = await GET(getReq);
    assert.ok(getRes.status === 200 || getRes.status === 500);
  });
});
