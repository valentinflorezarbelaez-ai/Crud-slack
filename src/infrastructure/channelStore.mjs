/**
 * INFRASTRUCTURE ADAPTER: CHANNEL REGISTRY PERSISTENCE
 * Stores the channel list and the active channel. Each channel keeps its own
 * task board (see storageAdapter.mjs), exactly like Slack Lists per channel.
 */

const CHANNELS_KEY = "crud_slack_taskflow_channels_v1";
const ACTIVE_KEY = "crud_slack_taskflow_active_channel_v1";

export const MAX_CHANNEL_NAME = 40;
export const MAX_CHANNEL_TOPIC = 120;

export const DEFAULT_CHANNELS = Object.freeze([
  {
    id: "general",
    name: "general",
    topic: "Reunión del viernes · plan accionable sin inventar fechas",
    kind: "preset",
    presetId: "reto-oficial-viernes",
    isPrivate: false,
    unread: 0
  },
  {
    id: "incidentes-prod",
    name: "incidentes-prod",
    topic: "Alertas urgentes de producción · asignación y notificación a soporte",
    kind: "preset",
    presetId: "incidente-slack-prod",
    isPrivate: false,
    unread: 3
  },
  {
    id: "operaciones",
    name: "operaciones",
    topic: "SharePoint, permisos y entregables de Operaciones",
    kind: "preset",
    presetId: "sharepoint-intranet",
    isPrivate: false,
    unread: 1
  },
  {
    id: "legal-auditoria",
    name: "legal-auditoria",
    topic: "Mensajes sin fechas · prueba de guardia anti-alucinación",
    kind: "preset",
    presetId: "sin-fechas-antihalucinacion",
    isPrivate: false,
    unread: 0
  }
]);

/**
 * Slack-style channel name: lowercase, no accents, words joined by hyphens.
 * @param {string} raw
 */
export function slugifyChannelName(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, MAX_CHANNEL_NAME)
    .replace(/-+$/, "");
}

function isValidChannel(c) {
  return (
    c &&
    typeof c.id === "string" &&
    c.id.length > 0 &&
    typeof c.name === "string" &&
    c.name.length > 0 &&
    (c.kind === "preset" || c.kind === "custom")
  );
}

function cloneDefaults() {
  return DEFAULT_CHANNELS.map((c) => ({ ...c }));
}

export function loadChannels() {
  try {
    const raw = window.localStorage.getItem(CHANNELS_KEY);
    if (!raw) return cloneDefaults();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return cloneDefaults();
    const valid = parsed.filter(isValidChannel).map((c) => ({
      id: c.id,
      name: c.name,
      topic: typeof c.topic === "string" ? c.topic : "",
      kind: c.kind,
      presetId: c.presetId || null,
      isPrivate: Boolean(c.isPrivate),
      unread: Number.isFinite(c.unread) ? Math.max(0, c.unread) : 0
    }));
    if (!valid.some((c) => c.id === "general")) return cloneDefaults();
    return valid;
  } catch {
    return cloneDefaults();
  }
}

export function saveChannels(channels) {
  try {
    window.localStorage.setItem(CHANNELS_KEY, JSON.stringify(channels));
  } catch {
    // Ignore quota or private-mode restrictions safely
  }
}

export function loadActiveChannelId() {
  try {
    return window.localStorage.getItem(ACTIVE_KEY) || "general";
  } catch {
    return "general";
  }
}

export function saveActiveChannelId(id) {
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // Ignore quota or private-mode restrictions safely
  }
}
