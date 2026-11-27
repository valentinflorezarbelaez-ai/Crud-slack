/**
 * NEON MANAGED BETTER AUTH — EMAIL & PASSWORD SIGN-UP / SIGN-IN / SESSION VERIFICATION
 * Powered by `@neon/auth` (`createAuthClient` + `BetterAuthVanillaAdapter`).
 * Registers authenticated users into `neon_auth` AND syncs isolated profile into `public.users`.
 */

import https from "node:https";
import dns from "node:dns";
import { createAuthClient } from "@neon/auth";
import { BetterAuthVanillaAdapter } from "@neon/auth/vanilla/adapters";
import { sql } from "../_db.js";
import { signSession, createSessionCookieHeader } from "../_auth.js";

const fallbackResolver = new dns.Resolver();
try {
  fallbackResolver.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {}

function resilientDnsLookup(hostname, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  const opts = typeof options === "object" && options !== null ? options : {};
  dns.lookup(hostname, opts, (err, address, family) => {
    if (!err && address) return cb(null, address, family);
    fallbackResolver.resolve4(hostname, (rErr, addresses) => {
      if (rErr || !addresses || addresses.length === 0) return cb(err || rErr);
      if (opts.all) {
        return cb(
          null,
          addresses.map((a) => ({ address: a, family: 4 }))
        );
      }
      return cb(null, addresses[0], 4);
    });
  });
}

if (!globalThis.__taskflowDnsResilientFetchInstalled && typeof globalThis.fetch === "function") {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.__taskflowDnsResilientFetchInstalled = true;
  globalThis.fetch = async function resilientFetch(input, init = {}) {
    try {
      return await nativeFetch(input, init);
    } catch (err) {
      const code = err?.cause?.code || err?.code || "";
      const msg = String(err?.cause?.message || err?.message || "");
      if (code !== "ENOTFOUND" && !msg.includes("ENOTFOUND") && !msg.includes("fetch failed")) {
        throw err;
      }
      const urlStr =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input?.url;
      if (!urlStr || !urlStr.startsWith("https://")) throw err;
      const urlObj = new URL(urlStr);
      const method = String(init?.method || input?.method || "GET").toUpperCase();
      const hdrs = new Headers(init?.headers || input?.headers || {});
      let bodyBuf = null;
      if (init?.body !== undefined && init?.body !== null) {
        bodyBuf =
          typeof init.body === "string"
            ? Buffer.from(init.body, "utf8")
            : Buffer.isBuffer(init.body)
              ? init.body
              : Buffer.from(init.body);
        if (!hdrs.has("content-length")) hdrs.set("content-length", String(bodyBuf.length));
      }
      const plainHeaders = {};
      hdrs.forEach((v, k) => {
        plainHeaders[k] = v;
      });

      return await new Promise((resolve, reject) => {
        const req = https.request(
          {
            protocol: urlObj.protocol,
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname + urlObj.search,
            method,
            headers: plainHeaders,
            lookup: resilientDnsLookup,
            timeout: 15000
          },
          (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
              const outHeaders = new Headers();
              for (const [k, val] of Object.entries(res.headers || {})) {
                if (Array.isArray(val)) {
                  for (const item of val) outHeaders.append(k, item);
                } else if (val !== undefined) {
                  outHeaders.set(k, String(val));
                }
              }
              const status = Number(res.statusCode || 500);
              const rawBuf = Buffer.concat(chunks);
              resolve(
                new Response(status === 204 || status === 304 ? null : rawBuf, {
                  status,
                  statusText: res.statusMessage || "",
                  headers: outHeaders
                })
              );
            });
          }
        );
        req.on("timeout", () => req.destroy(new Error("NEON_AUTH_TIMEOUT")));
        req.on("error", reject);
        if (bodyBuf) req.write(bodyBuf);
        req.end();
      });
    }
  };
}

function getNeonAuthBaseUrl() {
  return String(process.env.NEON_AUTH_BASE_URL || "").trim().replace(/\/+$/, "");
}

function resolveRequestOrigin(req) {
  const originHdr = req?.headers?.get?.("origin");
  if (originHdr && /^https?:\/\//i.test(originHdr)) return originHdr.replace(/\/+$/, "");
  const host = req?.headers?.get?.("x-forwarded-host") || req?.headers?.get?.("host");
  if (host) {
    const proto = req?.headers?.get?.("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return "https://crud-slack.vercel.app";
}

function readCookieMap(req) {
  const raw = req?.headers?.get?.("cookie") || "";
  const map = new Map();
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      map.set(k, decodeURIComponent(v));
    } catch {
      map.set(k, v);
    }
  }
  return map;
}

function extractSetCookies(headersObj) {
  if (!headersObj) return [];
  if (typeof headersObj.getSetCookie === "function") {
    return headersObj.getSetCookie();
  }
  const single = headersObj.get?.("set-cookie");
  return single ? [single] : [];
}

function buildUpstreamCookiePairs(setCookies = []) {
  return setCookies
    .map((line) => String(line || "").split(";")[0].trim())
    .filter((kv) => kv.includes("="))
    .join("; ");
}

function buildCookieHeader(name, value, maxAgeSeconds = 2592000) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function sanitizeAvatarSeed(seed) {
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
}

export async function GET(req) {
  try {
    const baseUrl = getNeonAuthBaseUrl();
    if (!baseUrl) {
      return Response.json({ ok: false, user: null }, { status: 200 });
    }

    const cookies = readCookieMap(req);
    const bearerHeader = req?.headers?.get?.("authorization") || "";
    const bearerToken = bearerHeader.startsWith("Bearer ") ? bearerHeader.slice(7).trim() : "";
    const token = bearerToken || cookies.get("neon_auth_token") || "";
    const upstreamCookie = cookies.get("neon_auth_cookie") || "";

    if (!token && !upstreamCookie) {
      return Response.json({ ok: false, user: null }, { status: 200 });
    }

    const headers = {
      Origin: resolveRequestOrigin(req),
      "X-Force-Fetch": "1"
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (upstreamCookie) headers.Cookie = upstreamCookie;

    const authClient = createAuthClient(baseUrl, {
      adapter: BetterAuthVanillaAdapter({
        fetchOptions: { headers }
      })
    });

    const { data, error } = await authClient.getSession();
    if (error || !data?.user) {
      return Response.json(
        { ok: false, user: null, error: error?.message || "SESSION_INVALID" },
        { status: 401 }
      );
    }

    return Response.json(
      {
        ok: true,
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          emailVerified: Boolean(data.user.emailVerified),
          createdAt: data.user.createdAt || null
        },
        session: {
          id: data.session?.id || null,
          userId: data.session?.userId || data.user.id,
          expiresAt: data.session?.expiresAt || null
        }
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" }
      }
    );
  } catch (err) {
    return Response.json({ ok: false, user: null, error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const baseUrl = getNeonAuthBaseUrl();
    if (!baseUrl) {
      return Response.json({ ok: false, error: "NEON_AUTH_BASE_URL_REQUIRED" }, { status: 503 });
    }

    const body = (await req?.json?.().catch(() => ({}))) || {};
    const action = String(body.action || "signup").trim().toLowerCase() === "signin" ? "signin" : "signup";
    const email = String(body.email || "").trim().toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const rawName = String(body.name || "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 80);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      return Response.json(
        { ok: false, error: "Ingresa un correo válido y una contraseña de mínimo 8 caracteres." },
        { status: 400 }
      );
    }

    const displayName = rawName || email.split("@")[0];
    const origin = resolveRequestOrigin(req);
    let capturedCookiePairs = "";

    const authClient = createAuthClient(baseUrl, {
      adapter: BetterAuthVanillaAdapter({
        fetchOptions: {
          headers: { Origin: origin },
          onSuccess: (ctx) => {
            const list = extractSetCookies(ctx?.response?.headers);
            const pairs = buildUpstreamCookiePairs(list);
            if (pairs) capturedCookiePairs = pairs;
          }
        }
      })
    });

    const authResult =
      action === "signin"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: displayName });

    if (authResult?.error || !authResult?.data?.user) {
      const msg =
        authResult?.error?.message ||
        (action === "signin" ? "Correo o contraseña incorrectos." : "No fue posible crear la cuenta.");
      return Response.json({ ok: false, error: msg }, { status: 401 });
    }

    const neonUser = authResult.data.user;
    const neonToken = String(authResult.data.token || authResult.data.session?.token || "");
    const cleanIdSuffix = String(neonUser.id || email).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 28);
    const targetUserId = `usr_n_${cleanIdSuffix}`;
    const finalName = String(neonUser.name || displayName).trim();
    const avatarUrl = neonUser.image || sanitizeAvatarSeed(cleanIdSuffix);
    const defaultStatus = "Espacio personal activo";

    const externalProviderKey = `neon_auth_${cleanIdSuffix}`;

    let appUser = {
      id: targetUserId,
      google_id: externalProviderKey,
      email: String(neonUser.email || email).toLowerCase(),
      full_name: finalName,
      avatar_url: avatarUrl,
      status_text: defaultStatus,
      preferences: {}
    };

    if (process.env.DATABASE_URL) {
      const existingRows = await sql(
        `SELECT id, google_id FROM users WHERE email = $1 OR id = $2 LIMIT 1;`,
        [appUser.email, targetUserId]
      );
      const dbUserId = existingRows.length > 0 ? existingRows[0].id : targetUserId;
      const dbExternalId = existingRows[0]?.google_id || externalProviderKey;
      const upsertRows = await sql(
        `
        INSERT INTO users (id, google_id, email, full_name, avatar_url, status_text, preferences, last_seen_at)
        VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE
        SET google_id = COALESCE(NULLIF(users.google_id, ''), EXCLUDED.google_id),
            email = EXCLUDED.email,
            full_name = EXCLUDED.full_name,
            avatar_url = COALESCE(NULLIF(users.avatar_url, ''), EXCLUDED.avatar_url),
            last_seen_at = NOW()
        RETURNING id, google_id, email, full_name, avatar_url, status_text,
                  COALESCE(preferences, '{}'::jsonb) AS preferences;
        `,
        [dbUserId, dbExternalId, appUser.email, finalName, avatarUrl, defaultStatus]
      );
      if (upsertRows[0]) appUser = upsertRows[0];
    }

    const sessionToken = await signSession({
      userId: appUser.id,
      googleId: appUser.google_id || null,
      neonAuthUserId: neonUser.id,
      email: appUser.email,
      fullName: appUser.full_name,
      avatarUrl: appUser.avatar_url,
      issuedAt: Date.now()
    });

    const outHeaders = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0, must-revalidate"
    });
    outHeaders.append("Set-Cookie", createSessionCookieHeader(sessionToken));
    if (neonToken) {
      outHeaders.append("Set-Cookie", buildCookieHeader("neon_auth_token", neonToken));
    }
    if (capturedCookiePairs) {
      outHeaders.append("Set-Cookie", buildCookieHeader("neon_auth_cookie", capturedCookiePairs));
    }

    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          id: appUser.id,
          google_id: appUser.google_id,
          email: appUser.email,
          full_name: appUser.full_name,
          avatar_url: appUser.avatar_url,
          status_text: appUser.status_text || defaultStatus,
          preferences: appUser.preferences || {},
          fullName: appUser.full_name,
          avatarUrl: appUser.avatar_url,
          statusText: appUser.status_text || defaultStatus
        },
        neonUser: {
          id: neonUser.id,
          email: neonUser.email,
          name: neonUser.name,
          emailVerified: Boolean(neonUser.emailVerified)
        }
      }),
      { status: 200, headers: outHeaders }
    );
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
