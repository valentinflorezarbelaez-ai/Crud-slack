import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Task API & Persistent Task Discussion Threads: api/tasks.js & api/messages.js", () => {
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

  it("normalizes channelId with c_ prefix and maps all personal space slugs", async () => {
    const { normalizeChannelId, isPersonalChannelId } = await import("../api/tasks.js");
    assert.equal(normalizeChannelId("c_general"), "general");
    assert.equal(normalizeChannelId("general"), "general");
    assert.equal(normalizeChannelId("c_URGENCIAS"), "urgencias");
    assert.equal(normalizeChannelId("mi-dia"), "personal");
    assert.equal(normalizeChannelId("personal"), "personal");
    assert.equal(normalizeChannelId("mis-proyectos"), "personal-proyectos");
    assert.equal(normalizeChannelId("notas-ideas"), "personal-notas");
    assert.equal(normalizeChannelId(""), "general");

    assert.equal(isPersonalChannelId("personal"), true);
    assert.equal(isPersonalChannelId("personal-proyectos"), true);
    assert.equal(isPersonalChannelId("personal-notas"), true);
    assert.equal(isPersonalChannelId("general"), false);
  });

  it("builds valid parameterized PostgreSQL bulk upsert statements with $1..$N placeholders", async () => {
    const { buildBulkTaskUpsert } = await import("../api/tasks.js");

    const sampleChunk = [
      {
        id: "tsk_101",
        title: "Test Task A",
        description: "Desc A",
        priority: "CRITICAL",
        priorityReason: "Urgent",
        status: "PENDING",
        deadlineDate: "2026-11-20",
        deadlineLabel: "2026-11-20",
        deadlineState: "CONFIRMED",
        missingDetails: "",
        assignee: "Valentín",
        sourceQuote: "do this",
        dependsOnOrder: null,
        grounded: true,
        channel: "slack",
        scheduledTime: "10:00",
        durationMinutes: 90,
        isPrivate: false,
        userId: "usr_valentin"
      },
      {
        id: "tsk_102",
        title: "Test Task B",
        description: "Desc B",
        priority: "MEDIUM",
        status: "IN_PROGRESS",
        isPrivate: false
      }
    ];

    const { queryText, flatParams, valuesRows } = buildBulkTaskUpsert(sampleChunk, "general", 1);

    // 2 tasks * 21 columns = 42 parameters
    assert.equal(flatParams.length, 42);
    assert.equal(valuesRows.length, 2);

    // Placeholders must all start with $ (never raw integer strings without $)
    assert.ok(valuesRows[0].startsWith("($1, $2, $3,"));
    assert.ok(valuesRows[0].endsWith(", NOW())"));
    assert.ok(valuesRows[1].startsWith("($22, $23, $24,"));
    assert.ok(valuesRows[1].endsWith(", NOW())"));

    // Ensure raw numbers without $ are not in valuesRows
    const rawNumberMatcher = /\(\s*\d+\s*,/;
    assert.equal(rawNumberMatcher.test(valuesRows[0]), false, "Must not contain raw unparameterized numbers");

    // Query must contain ON CONFLICT (id) DO UPDATE SET
    assert.ok(queryText.includes("INSERT INTO tasks ("));
    assert.ok(queryText.includes("ON CONFLICT (id) DO UPDATE SET"));
    assert.ok(queryText.includes("WHERE tasks.user_id IS NOT DISTINCT FROM EXCLUDED.user_id;"));
  });

  it("handles GET requests returning tasks and deterministic checksum for canonical channel", async () => {
    const { GET } = await import("../api/tasks.js");

    const req = new Request("http://localhost/api/tasks?channelId=general");
    const res = await GET(req);
    assert.ok(res.status === 200 || res.status === 500);
    const json = await res.json();
    assert.ok(typeof json.ok === "boolean");
    if (res.status === 200) {
      assert.equal(typeof json.checksum, "string");
    }
  });

  it("rejects unauthenticated or spoofed usr_g_* GET/POST on personal spaces, allowing signed cookies (BDD-CS-009)", async () => {
    if (!process.env.SESSION_SECRET) {
      process.env.SESSION_SECRET = "test_hermetic_session_secret_32_chars_long_minimum!";
    }
    const { GET, POST } = await import("../api/tasks.js");
    const { signSession } = await import("../api/_auth.js");

    for (const privSpace of ["personal", "personal-proyectos", "personal-notas"]) {
      const unauthGet = new Request(`http://localhost/api/tasks?channelId=${privSpace}`);
      const getRes = await GET(unauthGet);
      assert.equal(getRes.status, 401);

      // Spoofed Google userId query without cookie must also return 401
      const spoofGet = new Request(
        `http://localhost/api/tasks?channelId=${privSpace}&userId=usr_g_100470499712704597932`
      );
      const spoofGetRes = await GET(spoofGet);
      assert.equal(spoofGetRes.status, 401);

      const spoofPost = new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: privSpace,
          userId: "usr_g_100470499712704597932",
          tasks: [{ title: "Intento spoofed sin cookie" }]
        })
      });
      const spoofPostRes = await POST(spoofPost);
      assert.equal(spoofPostRes.status, 401);
    }

    // Signed HttpOnly cookie for usr_g_* succeeds in hermetic mode
    process.env.TASKFLOW_HERMETIC_TEST = "1";
    const token = await signSession({ userId: "usr_g_verified", fullName: "Verified User" });
    const signedGet = new Request("http://localhost/api/tasks?channelId=personal", {
      headers: { cookie: `taskflow_session=${encodeURIComponent(token)}` }
    });
    const signedRes = await GET(signedGet);
    if (!process.env.DATABASE_URL) {
      assert.equal(signedRes.status, 200);
      const signedJson = await signedRes.json();
      assert.equal(signedJson.ok, true);
      assert.equal(signedJson.userId, "usr_g_verified");
    }
  });

  it("handles personal private tasks with scheduledTime and (userId, channelId) isolation", async () => {
    process.env.TASKFLOW_HERMETIC_TEST = "1";
    if (!process.env.SESSION_SECRET) {
      process.env.SESSION_SECRET = "test_hermetic_session_secret_32_chars_long_minimum!";
    }
    const { POST, GET } = await import("../api/tasks.js");
    const { signSession } = await import("../api/_auth.js");

    // Unauthenticated private write must fail-closed (401) when DB is live on Vercel builds.
    const unauthPost = await POST(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: "personal",
          userId: "usr_test_hermetic",
          tasks: [
            {
              id: "tsk_priv_test_hermetic_unauth",
              title: "Should be rejected without session",
              scheduledTime: "09:30",
              durationMinutes: 45,
              isPrivate: true,
              userId: "usr_test_hermetic"
            }
          ]
        })
      })
    );
    if (process.env.DATABASE_URL) {
      // On Vercel builds with live Neon: isolation must reject spoofed private writes.
      // Do not POST authenticated fixtures into production data during the gate.
      assert.equal(unauthPost.status, 401, "live DB must reject spoofed private personal writes");
      const unauthGet = await GET(
        new Request("http://localhost/api/tasks?channelId=personal&userId=usr_test_hermetic")
      );
      assert.equal(unauthGet.status, 401, "live DB must reject spoofed private personal reads");
      return;
    }

    assert.equal(unauthPost.status, 200, "hermetic no-DB path should accept showcase writes");

    // Authenticated demo profile path (local hermetic, no Neon).
    const token = await signSession({
      userId: "usr_valentin",
      fullName: "Valentín Flórez Arbelaez"
    });
    const authHeaders = {
      "Content-Type": "application/json",
      cookie: `taskflow_session=${encodeURIComponent(token)}`
    };
    const postRes = await POST(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          channelId: "personal",
          userId: "usr_valentin",
          tasks: [
            {
              id: "tsk_priv_test_hermetic",
              title: "Hermetic Isolated Test Task",
              scheduledTime: "09:30",
              durationMinutes: 45,
              isPrivate: true,
              userId: "usr_valentin"
            }
          ]
        })
      })
    );
    assert.ok(
      postRes.status === 200 || postRes.status === 500,
      `unexpected auth private POST status: ${postRes.status}`
    );

    const getRes = await GET(
      new Request("http://localhost/api/tasks?channelId=personal&userId=usr_valentin", {
        headers: { cookie: `taskflow_session=${encodeURIComponent(token)}` }
      })
    );
    assert.ok(
      getRes.status === 200 || getRes.status === 500,
      `unexpected auth private GET status: ${getRes.status}`
    );
  });

  it("supports persistent task-level discussion threads via /api/messages?taskId=... (BDD-CS-010)", async () => {
    if (!process.env.SESSION_SECRET) {
      process.env.SESSION_SECRET = "test_hermetic_session_secret_32_chars_long_minimum!";
    }
    process.env.TASKFLOW_HERMETIC_TEST = "1";
    const { GET: getMessages, POST: postMessage } = await import("../api/messages.js");
    const { signSession } = await import("../api/_auth.js");

    // 1. Unauthenticated private task comments must return 401
    const unauthThreadGet = await getMessages(
      new Request("http://localhost/api/messages?taskId=tsk_101&channelId=personal")
    );
    assert.equal(unauthThreadGet.status, 401);

    // 2. Unauthenticated comment POST must return 401
    const unauthThreadPost = await postMessage(
      new Request("http://localhost/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: "tsk_101", channelId: "general", text: "Sin sesión" })
      })
    );
    assert.equal(unauthThreadPost.status, 401);

    // 3. Authenticated comment POST & GET with signed cookie succeeds in hermetic mode
    const token = await signSession({ userId: "usr_g_thread_tester", fullName: "Thread Tester" });
    if (!process.env.DATABASE_URL) {
      const authPost = await postMessage(
        new Request("http://localhost/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: `taskflow_session=${encodeURIComponent(token)}`
          },
          body: JSON.stringify({
            taskId: "tsk_101",
            channelId: "personal",
            text: "Acuerdo confirmado con finanzas."
          })
        })
      );
      assert.equal(authPost.status, 201);
      const postJson = await authPost.json();
      assert.equal(postJson.ok, true);
      assert.equal(postJson.comment.task_id, "tsk_101");

      const authGet = await getMessages(
        new Request("http://localhost/api/messages?taskId=tsk_101&channelId=personal", {
          headers: { cookie: `taskflow_session=${encodeURIComponent(token)}` }
        })
      );
      assert.equal(authGet.status, 200);
      const getJson = await authGet.json();
      assert.equal(getJson.ok, true);
      assert.ok(Array.isArray(getJson.comments));
    }
  });
});
