#!/usr/bin/env node
/** Redact sensitive .env.local values in place. Never prints secret values. */
import fs from "node:fs";
import crypto from "node:crypto";

const p = new URL("../.env.local", import.meta.url);
const filePath = p.pathname.replace(/^\/([A-Za-z]:)/, "$1"); // win file URL
const target = fs.existsSync(filePath) ? filePath : "C:\\Users\\valen\\Crud-slack\\.env.local";
if (!fs.existsSync(target)) {
  console.log("NO_ENV_LOCAL");
  process.exit(0);
}
const raw = fs.readFileSync(target, "utf8");
const out = raw.split(/\r?\n/).map((line) => {
  if (!line || line.trim().startsWith("#")) return line;
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) return line;
  const key = m[1];
  const val = m[2];
  if (!/KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL|CLIENT_ID|PRIVATE/i.test(key)) return line;
  const bare = val.replace(/^["']|["']$/g, "");
  if (!bare || /ROTATE_ME|replace-|YOUR_|changeme|example/i.test(bare)) return line;
  return `${key}=ROTATE_ME_SET_IN_HOST_SECRET_STORE`;
});
fs.writeFileSync(target, out.join("\n").endsWith("\n") ? out.join("\n") : out.join("\n") + "\n");
console.log(
  "REDACTED_OK digest16=" +
    crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex").slice(0, 16)
);
