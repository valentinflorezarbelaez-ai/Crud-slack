/**
 * UI VISUAL PREFERENCES — PER-USER EYE-CARE THEMES, TEXT SCALE & CLOUD SYNC
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-006..015, UI ergonomics & per-user personalization).
 *
 * Scopes user visual choices by userId in localStorage and syncs to Neon PostgreSQL
 * (/api/auth/me) so each user gets their own personalized look across devices.
 */

const THEMES = Object.freeze(["light", "warm", "dark"]);
const THEME_COLORS = Object.freeze({ light: "#f2f6f9", warm: "#f4f0e4", dark: "#070b14" });

function prefKey(baseKey, userId) {
  return userId ? `${baseKey}__usr_${userId}` : baseKey;
}

function readPref(baseKey, userId, fallback) {
  try {
    return localStorage.getItem(prefKey(baseKey, userId)) || fallback;
  } catch {
    return fallback;
  }
}

function writePref(baseKey, userId, value) {
  try {
    localStorage.setItem(prefKey(baseKey, userId), value);
  } catch {
    /* storage unavailable (private mode) */
  }
}

/**
 * Returns the next Friday (ISO yyyy-mm-dd) on or after the reference date.
 * @param {string} refIso
 */
export function nextFridayIso(refIso) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(refIso || "") ? new Date(`${refIso}T12:00:00`) : new Date();
  const delta = (5 - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + delta);
  return base.toISOString().slice(0, 10);
}

/**
 * Wires theme selector, theme cycle button, text scale toggle and layout focus toggle
 * with per-user local + cloud persistence.
 */
export function initVisualPreferences(refs, notify) {
  const root = document.documentElement;
  let activeUserId = null;

  const syncCloudPrefs = (patch) => {
    if (!activeUserId || typeof fetch !== "function") return;
    fetch("./api/auth/me", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: activeUserId, preferences: patch })
    }).catch(() => {});
  };

  const applyTheme = (theme, persistCloud = false) => {
    const safe = THEMES.includes(theme) ? theme : "light";
    root.setAttribute("data-theme", safe);
    if (refs.eyeCareSelect) refs.eyeCareSelect.value = safe;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[safe]);
    writePref("taskflow.theme", activeUserId, safe);
    if (persistCloud) syncCloudPrefs({ theme: safe });
  };

  const applyScale = (scale, persistCloud = false) => {
    const safe = scale === "xl" ? "xl" : "md";
    root.setAttribute("data-scale", safe);
    if (refs.scaleToggleBtn) {
      refs.scaleToggleBtn.textContent = safe === "xl" ? "🔍 Zoom: XL" : "🔍 Zoom: 100%";
    }
    writePref("taskflow.scale", activeUserId, safe);
    if (persistCloud) syncCloudPrefs({ scale: safe });
  };

  const applyLayout = (layout, persistCloud = false) => {
    const safe = layout === "focus" ? "focus" : "split";
    const focus = safe === "focus";
    refs.workspaceGrid?.classList.toggle("is-focus-board", focus);
    if (refs.layoutFocusBtn) {
      refs.layoutFocusBtn.textContent = focus ? "📐 1 Col" : "📐 2 Col";
    }
    writePref("taskflow.layout", activeUserId, safe);
    if (persistCloud) syncCloudPrefs({ layout: safe });
  };

  const setUserPreferences = (user) => {
    activeUserId = user?.id || null;
    const cloudPrefs = user?.preferences && typeof user.preferences === "object" ? user.preferences : {};
    const theme = cloudPrefs.theme || readPref("taskflow.theme", activeUserId, "light");
    const scale = cloudPrefs.scale || readPref("taskflow.scale", activeUserId, "md");
    const layout = cloudPrefs.layout || readPref("taskflow.layout", activeUserId, "split");
    applyTheme(theme, false);
    applyScale(scale, false);
    applyLayout(layout, false);
  };

  setUserPreferences(null);

  refs.themeToggleBtn?.addEventListener("click", () => {
    const current = root.getAttribute("data-theme") || "light";
    const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    applyTheme(next, true);
    notify(`Tema guardado en tu perfil: ${refs.eyeCareSelect?.selectedOptions[0]?.textContent || next}`);
  });
  refs.eyeCareSelect?.addEventListener("change", () => applyTheme(refs.eyeCareSelect.value, true));
  refs.scaleToggleBtn?.addEventListener("click", () => {
    applyScale(root.getAttribute("data-scale") === "xl" ? "md" : "xl", true);
  });
  refs.layoutFocusBtn?.addEventListener("click", () => {
    applyLayout(refs.workspaceGrid?.classList.contains("is-focus-board") ? "split" : "focus", true);
  });

  return { setUserPreferences };
}
