/**
 * LAYER-0 NEON POSTGRESQL CLIENT
 * Executes SQL statements over HTTP via Neon Serverless API.
 * Zero external npm dependencies. 100% Parameterized queries.
 */

const NEON_SQL_URL = "https://ep-holy-block-beru6683-pooler.c-9.us-east-2.aws.neon.tech/sql";
const DEFAULT_CONN = "postgresql://neondb_owner:npg_rXIwWJQtB19Y@ep-holy-block-beru6683-pooler.c-9.us-east-2.aws.neon.tech/neondb?sslmode=require";

export async function sql(queryText, params = []) {
  const connStr = process.env.DATABASE_URL || DEFAULT_CONN;
  const res = await fetch(NEON_SQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Neon-Connection-String": connStr
    },
    body: JSON.stringify({ query: queryText, params })
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.message || `Database query failed with status ${res.status}`);
  }

  const data = await res.json();
  return data.rows || [];
}
