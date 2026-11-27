/**
 * LAYER-0 NEON POSTGRESQL CLIENT
 * Executes SQL statements over HTTP via Neon Serverless API.
 * Zero external npm dependencies. 100% Parameterized queries.
 *
 * Law VI / AWS-Secrets-style: no embedded credentials or host-bound secrets.
 * Requires DATABASE_URL from the environment (Vercel/local .env). Fail-closed.
 */

import https from "node:https";
import dns from "node:dns";

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

async function fetchWithDnsFallback(url, options) {
  try {
    return await fetch(url, options);
  } catch (err) {
    const msg = String(err?.cause?.message || err?.message || "");
    if (!msg.includes("ENOTFOUND") && !msg.includes("fetch failed")) throw err;
    const u = new URL(url);
    return await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: u.hostname,
          port: u.port || 443,
          path: u.pathname + u.search,
          method: options.method || "POST",
          headers: options.headers || {},
          lookup: resilientDnsLookup,
          timeout: 9000
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            resolve(
              new Response(Buffer.concat(chunks), {
                status: Number(res.statusCode || 500),
                headers: new Headers(Object.entries(res.headers || {}).map(([k, v]) => [k, String(v)]))
              })
            );
          });
        }
      );
      req.on("timeout", () => req.destroy(new Error("DB_HTTP_TIMEOUT")));
      req.on("error", reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }
}

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("DATABASE_URL is required; refusing to query without an opaque env credential handle.");
  }
  return value.trim();
}

/**
 * Derive Neon HTTP SQL endpoint from a postgres connection string host.
 * Optional NEON_SQL_URL overrides when operators pin a custom gateway.
 */
function resolveNeonSqlUrl(connectionString) {
  const pinned = process.env.NEON_SQL_URL;
  if (typeof pinned === "string" && pinned.trim() !== "") {
    const url = new URL(pinned.trim());
    if (url.protocol !== "https:") {
      throw new Error("NEON_SQL_URL must use https.");
    }
    return url.href;
  }

  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection URL.");
  }
  if (!parsed.hostname) {
    throw new Error("DATABASE_URL is missing a hostname.");
  }
  return `https://${parsed.hostname}/sql`;
}

export async function sql(queryText, params = []) {
  const connStr = requireDatabaseUrl();
  const neonSqlUrl = resolveNeonSqlUrl(connStr);
  const maxAttempts = 2;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const res = await fetchWithDnsFallback(neonSqlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Neon-Connection-String": connStr
        },
        body: JSON.stringify({ query: queryText, params }),
        signal: AbortSignal.timeout(9000)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 150 + Math.floor(Math.random() * 100)));
          continue;
        }
        throw new Error(errJson.message || `Database query failed with status ${res.status}`);
      }

      const data = await res.json();
      return data.rows || [];
    } catch (err) {
      if (
        attempt < maxAttempts &&
        (err.name === "TimeoutError" ||
          (typeof err.message === "string" && (err.message.includes("fetch failed") || err.message.includes("network"))))
      ) {
        await new Promise((resolve) => setTimeout(resolve, 150 + Math.floor(Math.random() * 100)));
        continue;
      }
      throw err;
    }
  }
}
