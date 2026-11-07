/**
 * INFRASTRUCTURE ADAPTER: MULTI-USER CHANNEL REGISTRY PERSISTENCE
 * Scopes channel lists and active channel selection per userId in localStorage.
 * Real authenticated accounts receive clean private personal spaces ("Mi Día",
 * "Mis Proyectos", "Notas & Ideas") plus only channels they created or joined.
 * Demo profiles retain the 4 challenge showcase presets.
 */

const CHANNELS_KEY = "crud_slack_taskflow_channels_v1";
const ACTIVE_KEY = "crud_slack_taskflow_active_channel_v1";

export const MAX_CHANNEL_NAME = 40;
export const MAX_CHANNEL_TOPIC = 120;

export const DEMO_PROFILE_IDS = Object.freeze([
  "usr_valentin",
  "usr_ana",
  "usr_carlos",
  "usr_elena"
]);

export function isDemoProfileId(userId) {
  return DEMO_PROFILE_IDS.includes(String(userId || "").trim());
}

export const PERSONAL_CHANNEL = Object.freeze({
  id: "personal",
  name: "mi-dia",
  label: "Mi Día (Privado)",
  topic: "Agenda personal privada · solo tú ves tus tareas y alarmas horarias",
  kind: "personal",
  presetId: null,
  isPrivate: true,
  unread: 0
});

export const PERSONAL_SPACES = Object.freeze([
  PERSONAL_CHANNEL,
  Object.freeze({
    id: "personal-proyectos",
    name: "mis-proyectos",
    label: "Mis Proyectos",
    topic: "Metas, proyectos y entregas privadas de tu cuenta",
    kind: "personal",
    presetId: null,
    isPrivate: true,
    unread: 0
  }),
  Object.freeze({
    id: "personal-notas",
    name: "notas-ideas",
    label: "Notas & Ideas",
    topic: "Apuntes rápidos y recordatorios privados de tu espacio",
    kind: "personal",
    presetId: null,
    isPrivate: true,
    unread: 0
  })
]);

export const DEMO_PRESET_CHANNELS = Object.freeze([
  {
    id: "general",
    name: "general",
    label: "general",
    topic: "Reunión del viernes · plan accionable sin inventar fechas",
    kind: "preset",
    presetId: "reto-oficial-viernes",
    isPrivate: false,
    unread: 0
  },
  {
    id: "incidentes-prod",
    name: "incidentes-prod",
    label: "incidentes-prod",
    topic: "Alertas urgentes de producción · asignación y notificación a soporte",
    kind: "preset",
    presetId: "incidente-slack-prod",
    isPrivate: false,
    unread: 3
  },
  {
    id: "operaciones",
    name: "operaciones",
    label: "operaciones",
    topic: "SharePoint, permisos y entregables de Operaciones",
    kind: "preset",
    presetId: "sharepoint-intranet",
    isPrivate: false,
    unread: 1
  },
  {
    id: "legal-auditoria",
    name: "legal-auditoria",
    label: "legal-auditoria",
    topic: "Mensajes sin fechas · prueba de guardia anti-alucinación",
    kind: "preset",
    presetId: "sin-fechas-antihalucinacion",
    isPrivate: false,
    unread: 0
  }
]);

export const DEFAULT_CHANNELS = Object.freeze([
  ...PERSONAL_SPACES,
  ...DEMO_PRESET_CHANNELS
]);

function channelsKeyFor(userId) {
  const clean = String(userId || "").trim();
  return clean ? `${CHANNELS_KEY}__usr_${clean}` : CHANNELS_KEY;
}

function activeKeyFor(userId) {
  const clean = String(userId || "").trim();
  return clean ? `${ACTIVE_KEY}__usr_${clean}` : ACTIVE_KEY;
}

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
    (c.kind === "personal" || c.kind === "preset" || c.kind === "custom")
  );
}

function clonePersonalSpaces() {
  return PERSONAL_SPACES.map((c) => ({ ...c }));
}

function cloneDemoDefaults() {
  return DEFAULT_CHANNELS.map((c) => ({ ...c }));
}

function ensurePersonalSpaces(list) {
  const result = [...list];
  for (let i = PERSONAL_SPACES.length - 1; i >= 0; i--) {
    const space = PERSONAL_SPACES[i];
    if (!result.some((c) => c.id === space.id)) {
      result.unshift({ ...space });
    }
  }
  return result;
}

/**
 * Loads channels scoped to a specific userId.
 * Real users receive clean personal spaces + their own custom channels (no demo presets).
 * Demo profiles receive personal spaces + the 4 challenge presets.
 * @param {string|null} [userId]
 */
export function loadChannels(userId = null) {
  const isDemo = isDemoProfileId(userId);
  const fallback = () => (isDemo ? cloneDemoDefaults() : clonePersonalSpaces());

  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return fallback();
    }
    const raw = window.localStorage.getItem(channelsKeyFor(userId));
    if (!raw) return fallback();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback();

    let valid = parsed
      .filter(isValidChannel)
      .filter((c) => (isDemo ? true : c.kind !== "preset"))
      .map((c) => {
        const canonicalPersonal = PERSONAL_SPACES.find((p) => p.id === c.id);
        return {
          id: c.id,
          name: canonicalPersonal ? canonicalPersonal.name : c.name,
          label:
            typeof c.label === "string" && c.label
              ? c.label
              : canonicalPersonal
                ? canonicalPersonal.label
                : c.name,
          topic:
            typeof c.topic === "string" && c.topic
              ? c.topic
              : canonicalPersonal
                ? canonicalPersonal.topic
                : "",
          kind: canonicalPersonal ? "personal" : c.kind,
          presetId: c.presetId || null,
          isPrivate: canonicalPersonal ? true : Boolean(c.isPrivate),
          unread: Number.isFinite(c.unread) ? Math.max(0, c.unread) : 0
        };
      });

    valid = ensurePersonalSpaces(valid);
    if (isDemo && !valid.some((c) => c.id === "general")) {
      valid = [...valid, ...DEMO_PRESET_CHANNELS.map((c) => ({ ...c }))];
    }
    return valid;
  } catch {
    return fallback();
  }
}

export function saveChannels(channels, userId = null) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(channelsKeyFor(userId), JSON.stringify(channels));
  } catch {
    // Ignore quota or private-mode restrictions safely
  }
}

export function loadActiveChannelId(userId = null) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return "personal";
    return window.localStorage.getItem(activeKeyFor(userId)) || "personal";
  } catch {
    return "personal";
  }
}

export function saveActiveChannelId(id, userId = null) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(activeKeyFor(userId), id);
  } catch {
    // Ignore quota or private-mode restrictions safely
  }
}
