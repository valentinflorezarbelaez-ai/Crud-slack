/**
 * APPLICATION SERVICE: OMNICHANNEL EMAIL (.eml) & CHAT EXPORT (.txt, .md) INGESTOR
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-019, BDD-CS-011).
 *
 * Parses RFC 5322 .eml email files (including Quoted-Printable, Base64, and RFC 2047 headers),
 * WhatsApp .txt exports, and Slack/Markdown .md/.txt threads into sanitized intake payloads
 * bounded to 4,000 characters with automatic source channel detection.
 * Zero external runtime dependencies (runs identically in browser and Node.js 24).
 */

import { sanitizePlainText } from "../domain/taskEntities.mjs";

const MAX_INTAKE_CHARS = 4000;

/**
 * Decodes bytes to UTF-8 safely in both browser and Node.js runtimes.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function decodeUtf8Bytes(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  }
}

/**
 * Decodes Base64 string into UTF-8 text.
 * @param {string} raw
 * @returns {string}
 */
function decodeBase64Utf8(raw) {
  const cleaned = String(raw || "").replace(/\s+/g, "");
  if (!cleaned) return "";
  try {
    if (typeof atob === "function") {
      const bin = atob(cleaned);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return decodeUtf8Bytes(bytes);
    }
    if (typeof Buffer !== "undefined") {
      return Buffer.from(cleaned, "base64").toString("utf8");
    }
  } catch {
    // Fallback to raw text
  }
  return raw;
}

/**
 * Decodes Quoted-Printable transfer encoding into UTF-8 text.
 * @param {string} raw
 * @returns {string}
 */
export function decodeQuotedPrintable(raw) {
  const unfolded = String(raw || "").replace(/=\r?\n/g, "");
  const bytes = [];
  for (let i = 0; i < unfolded.length; i++) {
    if (unfolded[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(unfolded.slice(i + 1, i + 3))) {
      bytes.push( parseInt(unfolded.slice(i + 1, i + 3), 16) );
      i += 2;
    } else {
      const code = unfolded.charCodeAt(i);
      if (code < 128) {
        bytes.push(code);
      } else {
        const encoded = new TextEncoder().encode(unfolded[i]);
        for (const b of encoded) bytes.push(b);
      }
    }
  }
  return decodeUtf8Bytes(new Uint8Array(bytes));
}

/**
 * Decodes RFC 2047 encoded-word headers (e.g. =?UTF-8?Q?Reuni=C3=B3n?= or =?UTF-8?B?...?=).
 * @param {string} headerVal
 * @returns {string}
 */
function decodeMimeHeader(headerVal) {
  return String(headerVal || "").replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_full, _charset, encoding, payload) => {
      if (String(encoding).toUpperCase() === "B") {
        return decodeBase64Utf8(payload);
      }
      return decodeQuotedPrintable(String(payload).replace(/_/g, " "));
    }
  );
}

/**
 * Strips HTML tags and normalizes whitespace when an email only contains text/html.
 * @param {string} html
 * @returns {string}
 */
function stripHtmlTags(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Splits a raw MIME entity into unfolded headers map and raw body.
 * @param {string} rawEntity
 */
function splitMimeEntity(rawEntity) {
  const normalized = String(rawEntity || "").replace(/\r\n/g, "\n");
  const sepIdx = normalized.indexOf("\n\n");
  const headerBlock = sepIdx >= 0 ? normalized.slice(0, sepIdx) : "";
  const bodyBlock = sepIdx >= 0 ? normalized.slice(sepIdx + 2) : normalized;

  const unfoldedHeaders = headerBlock.replace(/\n[ \t]+/g, " ");
  /** @type {Record<string, string>} */
  const headers = {};
  for (const line of unfoldedHeaders.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const val = line.slice(colonIdx + 1).trim();
      headers[key] = val;
    }
  }
  return { headers, body: bodyBlock };
}

/**
 * Extracts readable plain text body from single-part or multipart MIME structures.
 * @param {Record<string, string>} headers
 * @param {string} body
 * @returns {string}
 */
function extractMimeBodyText(headers, body) {
  const contentType = headers["content-type"] || "text/plain";
  const transferEncoding = (headers["content-transfer-encoding"] || "").toLowerCase();

  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const parts = body.split(`--${boundary}`);
    let plainCandidate = "";
    let htmlCandidate = "";

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed || trimmed === "--") continue;
      const sub = splitMimeEntity(trimmed);
      const subType = (sub.headers["content-type"] || "text/plain").toLowerCase();
      if (subType.includes("multipart/")) {
        const nested = extractMimeBodyText(sub.headers, sub.body);
        if (nested && !plainCandidate) plainCandidate = nested;
      } else if (subType.includes("text/plain") && !plainCandidate) {
        plainCandidate = extractMimeBodyText(sub.headers, sub.body);
      } else if (subType.includes("text/html") && !htmlCandidate) {
        htmlCandidate = extractMimeBodyText(sub.headers, sub.body);
      }
    }
    return plainCandidate || htmlCandidate;
  }

  let decoded = body;
  if (transferEncoding.includes("quoted-printable")) {
    decoded = decodeQuotedPrintable(body);
  } else if (transferEncoding.includes("base64")) {
    decoded = decodeBase64Utf8(body);
  }

  if (contentType.toLowerCase().includes("text/html")) {
    return stripHtmlTags(decoded);
  }
  return decoded.trim();
}

/**
 * Parses an ingested .eml, .txt, or .md file into a structured workplace request.
 *
 * @param {{ filename: string, content: string }} input
 * @returns {{
 *   ok: boolean,
 *   detectedChannel: "email" | "whatsapp" | "slack" | "teams",
 *   subject: string,
 *   sender: string,
 *   text: string,
 *   error?: string
 * }}
 */
export function parseIngestedFile({ filename, content }) {
  const name = String(filename || "mensaje.txt").trim();
  const ext = (name.split(".").pop() || "").toLowerCase();
  const raw = String(content || "");

  if (!raw.trim()) {
    return {
      ok: false,
      detectedChannel: "slack",
      subject: "",
      sender: "",
      text: "",
      error: "El archivo seleccionado está vacío."
    };
  }

  // 1. RFC 5322 Email (.eml) or raw MIME headers
  const looksLikeEml =
    ext === "eml" || (/^(?:From|Subject|MIME-Version|Received):/im.test(raw.slice(0, 800)) && raw.includes("\n\n"));

  if (looksLikeEml) {
    const { headers, body } = splitMimeEntity(raw);
    const subject = sanitizePlainText(decodeMimeHeader(headers["subject"] || "")).slice(0, 180);
    const sender = sanitizePlainText(decodeMimeHeader(headers["from"] || "")).slice(0, 140);
    const bodyText = sanitizePlainText(extractMimeBodyText(headers, body));

    const headerLines = [];
    if (subject) headerLines.push(`Asunto: ${subject}`);
    if (sender) headerLines.push(`De: ${sender}`);

    const combined = [headerLines.join("\n"), bodyText]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, MAX_INTAKE_CHARS)
      .trim();

    if (combined.length < 4) {
      return {
        ok: false,
        detectedChannel: "email",
        subject,
        sender,
        text: "",
        error: "No se encontró texto legible dentro del correo .eml."
      };
    }

    return {
      ok: true,
      detectedChannel: "email",
      subject,
      sender,
      text: combined
    };
  }

  // 2. WhatsApp Export (.txt)
  const whatsappPattern =
    /(?:^|\n)(?:\[\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}\s*(?:a\.?\s*m\.?|p\.?\s*m\.?|AM|PM)?\s*-\s*[^:]+:)/;

  if (whatsappPattern.test(raw)) {
    const lines = raw
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((line) => !/cifrados de extremo a extremo|end-to-end encrypted|<Multimedia omitido>|<Media omitted>/i.test(line));
    const tailText = sanitizePlainText(lines.slice(-45).join("\n")).slice(0, MAX_INTAKE_CHARS).trim();
    return {
      ok: tailText.length >= 4,
      detectedChannel: "whatsapp",
      subject: name,
      sender: "",
      text: tailText,
      ...(tailText.length < 4 ? { error: "La exportación de WhatsApp no contiene mensajes de texto accionables." } : {})
    };
  }

  // 3. Microsoft Teams or Slack / Markdown (.md, .txt)
  const isTeams = /microsoft teams|teams meeting/i.test(raw.slice(0, 500));
  const cleanText = sanitizePlainText(raw).slice(0, MAX_INTAKE_CHARS).trim();
  if (cleanText.length < 4) {
    return {
      ok: false,
      detectedChannel: isTeams ? "teams" : "slack",
      subject: name,
      sender: "",
      text: "",
      error: "El archivo contiene menos de 4 caracteres útiles."
    };
  }

  return {
    ok: true,
    detectedChannel: isTeams ? "teams" : "slack",
    subject: name,
    sender: "",
    text: cleanText
  };
}
