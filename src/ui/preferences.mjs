/**
 * UI VISUAL PREFERENCES — EYE-CARE THEMES, TEXT SCALE & LAYOUT FOCUS
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-006..009, UI ergonomics).
 *
 * Persists user choices in localStorage and only toggles attributes/classes
 * (zero inline style mutations, strict CSP compliant).
 */

const THEMES = Object.freeze(["light", "warm", "dark"]);
const THEME_COLORS = Object.freeze({ light: "#f2f6f9", warm: "#f4f0e4", dark: "#070b14" });

function readPref(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, value);
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
 * Wires theme selector, theme cycle button, text scale toggle and layout focus toggle.
 * @param {{ eyeCareSelect?: HTMLSelectElement|null, themeToggleBtn?: HTMLElement|null,
 *   scaleToggleBtn?: HTMLElement|null, layoutFocusBtn?: HTMLElement|null,
 *   workspaceGrid?: Element|null }} refs
 * @param {(msg: string) => void} notify
 */
export function initVisualPreferences(refs, notify) {
  const root = document.documentElement;

  const applyTheme = (theme) => {
    const safe = THEMES.includes(theme) ? theme : "light";
    root.setAttribute("data-theme", safe);
    if (refs.eyeCareSelect) refs.eyeCareSelect.value = safe;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[safe]);
    writePref("taskflow.theme", safe);
  };

  const applyScale = (scale) => {
    const safe = scale === "xl" ? "xl" : "lg";
    root.setAttribute("data-scale", safe);
    if (refs.scaleToggleBtn) {
      refs.scaleToggleBtn.textContent = safe === "xl" ? "🔍 Tamaño: Extra Grande" : "🔍 Tamaño: Grande";
    }
    writePref("taskflow.scale", safe);
  };

  const applyLayout = (layout) => {
    const focus = layout === "focus";
    refs.workspaceGrid?.classList.toggle("is-focus-board", focus);
    if (refs.layoutFocusBtn) {
      refs.layoutFocusBtn.textContent = focus ? "📐 Vista: Tablero Completo" : "📐 Vista: 2 Columnas";
    }
    writePref("taskflow.layout", focus ? "focus" : "split");
  };

  applyTheme(readPref("taskflow.theme", "light"));
  applyScale(readPref("taskflow.scale", "lg"));
  applyLayout(readPref("taskflow.layout", "split"));

  refs.themeToggleBtn?.addEventListener("click", () => {
    const current = root.getAttribute("data-theme") || "light";
    const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    applyTheme(next);
    notify(`Perfil visual: ${refs.eyeCareSelect?.selectedOptions[0]?.textContent || next}`);
  });
  refs.eyeCareSelect?.addEventListener("change", () => applyTheme(refs.eyeCareSelect.value));
  refs.scaleToggleBtn?.addEventListener("click", () => {
    applyScale(root.getAttribute("data-scale") === "xl" ? "lg" : "xl");
  });
  refs.layoutFocusBtn?.addEventListener("click", () => {
    applyLayout(refs.workspaceGrid?.classList.contains("is-focus-board") ? "split" : "focus");
  });
}
