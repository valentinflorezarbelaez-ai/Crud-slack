/**
 * LAYER-0 NEON POSTGRESQL CLIENT
 * Executes SQL statements over HTTP via Neon Serverless API.
 * Zero external npm dependencies. 100% Parameterized queries.
 *
 * Law VI / AWS-Secrets-style: no embedded credentials or host-bound secrets.
 * Requires DATABASE_URL from the environment (Vercel/local .env). Fail-closed.
 */

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
      const res = await fetch(neonSqlUrl, {
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
