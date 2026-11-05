/**
 * PUBLIC OAuth client id bootstrap for GIS button mount.
 * Returns only GOOGLE_CLIENT_ID from host env — never secrets.
 * Fail-closed when unset (503).
 */

function requireGoogleClientId() {
  const id = (process.env.GOOGLE_CLIENT_ID || "").trim();
  if (!id) {
    throw new Error("GOOGLE_CLIENT_ID_REQUIRED");
  }
  return id;
}

export async function GET() {
  try {
    const clientId = requireGoogleClientId();
    return Response.json(
      { ok: true, clientId },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
          "Content-Type": "application/json"
        }
      }
    );
  } catch {
    return Response.json(
      { ok: false, error: "GOOGLE_CLIENT_ID_REQUIRED" },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
          "Content-Type": "application/json"
        }
      }
    );
  }
}
