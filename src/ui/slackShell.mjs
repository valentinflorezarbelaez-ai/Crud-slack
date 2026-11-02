/**
 * SLACK SHELL — sidebar, command palette (Ctrl/Cmd+K), composer formatting.
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-010..012). Pure DOM, strict-CSP safe
 * (no innerHTML, no inline styles except CSSOM height on the composer).
 */

const $ = (id) => document.getElementById(id);
const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const shell = $("app-shell");

function setSidebarOpen(open) {
  shell?.classList.toggle("is-sidebar-open", open);
  const btn = $("sidebar-toggle-btn");
  btn?.setAttribute("aria-expanded", String(open));
  if ($("sidebar-backdrop")) $("sidebar-backdrop").hidden = !open;
}

function initSidebar() {
  $("sidebar-toggle-btn")?.addEventListener("click", () => {
    setSidebarOpen(!shell.classList.contains("is-sidebar-open"));
  });
  $("sidebar-backdrop")?.addEventListener("click", () => setSidebarOpen(false));
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && shell?.classList.contains("is-sidebar-open")) setSidebarOpen(false);
  });

  document.querySelectorAll(".sidebar-section__toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      const list = $(toggle.getAttribute("aria-controls") || "");
      if (list) list.hidden = !open;
    });
  });

  document.querySelectorAll("[data-proxy]").forEach((btn) => {
    const target = $(btn.dataset.proxy || "");
    if (!target) return;
    btn.addEventListener("click", () => {
      target.click();
      setSidebarOpen(false);
    });
    if (btn.classList.contains("rail-btn") && target.hasAttribute("aria-pressed")) {
      const mirror = () => btn.classList.toggle("is-active", target.classList.contains("is-active"));
      new MutationObserver(mirror).observe(target, { attributes: true, attributeFilter: ["class"] });
      mirror();
    }
  });

  const channels = $("sidebar-channels");
  const syncChannel = () => {
    const active = channels?.querySelector(".slack-channel-pill.is-active");
    if (!active) return;
    const name = $("channel-header-name");
    const topic = $("channel-header-topic");
    if (name) name.textContent = active.dataset.channelName || "general";
    if (topic) topic.textContent = active.dataset.topic || "";
    active.classList.remove("is-unread");
    active.querySelector(".sidebar-item__badge")?.remove();
  };
  if (channels) {
    new MutationObserver(syncChannel).observe(channels, {
      attributes: true,
      attributeFilter: ["class"],
      subtree: true
    });
    channels.addEventListener("click", () => setSidebarOpen(false));
  }
  syncChannel();

  document.querySelectorAll("[data-mention]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const field = /** @type {HTMLTextAreaElement|null} */ ($("input-message"));
      if (!field) return;
      insertAtCaret(field, `${btn.dataset.mention} `);
      setSidebarOpen(false);
    });
  });
}

/* ---------- Composer ---------- */
function insertAtCaret(field, text) {
  const { selectionStart: s, selectionEnd: e, value } = field;
  field.value = value.slice(0, s) + text + value.slice(e);
  const pos = s + text.length;
  field.setSelectionRange(pos, pos);
  field.focus();
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function wrapSelection(field, before, after, fallback) {
  const { selectionStart: s, selectionEnd: e, value } = field;
  const chosen = value.slice(s, e) || fallback;
  field.value = value.slice(0, s) + before + chosen + after + value.slice(e);
  field.setSelectionRange(s + before.length, s + before.length + chosen.length);
  field.focus();
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function prefixLines(field, prefix) {
  const { selectionStart: s, selectionEnd: e, value } = field;
  const start = value.lastIndexOf("\n", s - 1) + 1;
  const block = value.slice(start, e) || "";
  const next = (block || "tarea").split("\n").map((l) => prefix + l).join("\n");
  field.value = value.slice(0, start) + next + value.slice(e);
  field.setSelectionRange(start, start + next.length);
  field.focus();
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

const FORMATS = {
  bold: (f) => wrapSelection(f, "*", "*", "negrita"),
  italic: (f) => wrapSelection(f, "_", "_", "cursiva"),
  strike: (f) => wrapSelection(f, "~", "~", "tachado"),
  code: (f) => wrapSelection(f, "`", "`", "código"),
  link: (f) => wrapSelection(f, "<https://|", ">", "texto del enlace"),
  list: (f) => prefixLines(f, "• "),
  mention: (f) => insertAtCaret(f, "@")
};

function initComposer() {
  const field = /** @type {HTMLTextAreaElement|null} */ ($("input-message"));
  const pop = $("emoji-pop");
  const emojiBtn = document.querySelector('[data-fmt="emoji"]');
  if (!field) return;

  const closePop = () => {
    if (pop) pop.hidden = true;
    emojiBtn?.setAttribute("aria-expanded", "false");
  };

  document.querySelectorAll("[data-fmt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.fmt;
      if (kind === "emoji" && pop) {
        pop.hidden = !pop.hidden;
        btn.setAttribute("aria-expanded", String(!pop.hidden));
        if (!pop.hidden) pop.querySelector("button")?.focus();
        return;
      }
      closePop();
      FORMATS[kind]?.(field);
    });
  });

  pop?.addEventListener("click", (ev) => {
    const choice = /** @type {HTMLElement} */ (ev.target).closest("[data-emoji]");
    if (!choice) return;
    insertAtCaret(field, choice.dataset.emoji || "");
    closePop();
  });
  document.addEventListener("click", (ev) => {
    const t = /** @type {Element} */ (ev.target);
    if (pop && !pop.hidden && !t.closest("#emoji-pop, [data-fmt='emoji']")) closePop();
  });
  pop?.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      closePop();
      /** @type {HTMLElement|null} */ (emojiBtn)?.focus();
    }
  });

  field.addEventListener("keydown", (ev) => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.shiftKey) return;
    const k = ev.key.toLowerCase();
    if (k === "b") {
      ev.preventDefault();
      FORMATS.bold(field);
    } else if (k === "i") {
      ev.preventDefault();
      FORMATS.italic(field);
    }
  });

  const grow = () => {
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 260)}px`;
  };
  field.addEventListener("input", grow);
  grow();
}

/* ---------- Command palette ---------- */
function extractTasksFromText(text) {
  $("nav-btn-workspace")?.click();
  const field = /** @type {HTMLTextAreaElement|null} */ ($("input-message"));
  if (!field) return;
  field.value = text;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.scrollIntoView({ behavior: "smooth", block: "center" });
  $("analyze-submit-btn")?.click();
}

function focusComposer() {
  $("nav-btn-workspace")?.click();
  const field = $("input-message");
  field?.scrollIntoView({ behavior: "smooth", block: "center" });
  field?.focus();
}

function buildAiCommands(query) {
  const text = query.trim();
  const ai = [];
  if (text.length >= 3) {
    ai.push({
      group: "TaskFlow AI",
      label: `Extraer tareas de: «${text.length > 60 ? `${text.slice(0, 60)}…` : text}»`,
      hint: "Preguntar a la IA",
      ai: true,
      run: () => extractTasksFromText(text)
    });
  } else {
    ai.push(
      {
        group: "TaskFlow AI",
        label: "Convertir un mensaje en tareas",
        hint: "Pegar y analizar",
        ai: true,
        run: focusComposer
      },
      {
        group: "TaskFlow AI",
        label: "Resumir lo pendiente para el canal",
        hint: "Markdown",
        ai: true,
        run: () => $("copy-slack-md-btn")?.click()
      }
    );
  }
  return ai;
}

function buildCommands(query) {
  const cmds = [];
  const click = (id) => () => $(id)?.click();

  document.querySelectorAll("#sidebar-channels .slack-channel-pill").forEach((pill) => {
    cmds.push({
      group: "Canales",
      label: `# ${pill.dataset.channelName}`,
      hint: "Abrir canal",
      run: () => pill.click()
    });
  });
  cmds.push(
    { group: "Ir a", label: "Slack Lists", hint: "Vista principal", run: click("nav-btn-workspace") },
    { group: "Ir a", label: "Docs del reto", hint: "Presentación", run: click("nav-btn-presentation") },
    { group: "Ir a", label: "Vista tarjetas", hint: "1", run: click("view-mode-cards") },
    { group: "Ir a", label: "Vista Kanban", hint: "3", run: click("view-mode-kanban") },
    { group: "Ir a", label: "Vista tabla", hint: "2", run: click("view-mode-table") },
    { group: "Ir a", label: "Vista SharePoint", hint: "4", run: click("view-mode-sharepoint") },
    { group: "Acciones", label: "Nueva tarea", hint: "Alt+N", run: click("add-task-btn") },
    { group: "Acciones", label: "Exportar CSV para SharePoint", hint: "CSV", run: click("export-csv-btn") },
    { group: "Acciones", label: "Tarjeta adaptable de Teams", hint: "JSON", run: click("export-teams-card-btn") },
    { group: "Acciones", label: "Copiar resumen para Slack", hint: "Markdown", run: click("copy-slack-md-btn") },
    { group: "Acciones", label: "Exportar contrato JSON", hint: "JSON", run: click("export-json-btn") },
    { group: "Preferencias", label: "Cambiar tema", hint: "Claro / cálido / oscuro", run: click("theme-toggle-btn") },
    { group: "Preferencias", label: "Cambiar tamaño de texto", hint: "Zoom", run: click("scale-toggle-btn") },
    { group: "Preferencias", label: "Alternar diseño de 2 columnas", hint: "Layout", run: click("layout-focus-btn") },
    { group: "Preferencias", label: "Imprimir memo ejecutivo", hint: "Alt+P", run: () => window.print() }
  );

  if (query) {
    const seen = new Set();
    document.querySelectorAll("[data-task-id]").forEach((card) => {
      const title = card.querySelector(".task-card__title")?.textContent?.trim();
      const id = card.getAttribute("data-task-id");
      if (!title || !id || seen.has(id)) return;
      seen.add(id);
      cmds.push({
        group: "Tareas",
        label: title,
        hint: "Ir a la tarea",
        run: () => {
          if ($("view-workspace")?.hidden) $("nav-btn-workspace")?.click();
          const target = document.querySelector(`[data-task-id="${CSS.escape(id)}"]`);
          target?.scrollIntoView({ behavior: "smooth", block: "center" });
          target?.classList.add("is-flash");
          setTimeout(() => target?.classList.remove("is-flash"), 1700);
        }
      });
    });
  }

  const tokens = norm(query).split(/\s+/).filter(Boolean);
  const matches = cmds
    .filter((c) => tokens.every((t) => norm(`${c.label} ${c.hint} ${c.group}`).includes(t)))
    .slice(0, 40);
  return [...buildAiCommands(query), ...matches];
}

function initPalette() {
  const dialog = /** @type {HTMLDialogElement|null} */ ($("cmdk-dialog"));
  const input = /** @type {HTMLInputElement|null} */ ($("cmdk-input"));
  const list = $("cmdk-list");
  const empty = $("cmdk-empty");
  if (!dialog || !input || !list) return;

  let items = [];
  let index = 0;

  const select = (next) => {
    const options = list.querySelectorAll('[role="option"]');
    if (!options.length) return;
    index = (next + options.length) % options.length;
    options.forEach((o, i) => o.setAttribute("aria-selected", String(i === index)));
    input.setAttribute("aria-activedescendant", options[index].id);
    options[index].scrollIntoView({ block: "nearest" });
  };

  const render = () => {
    items = buildCommands(input.value);
    list.replaceChildren();
    let lastGroup = "";
    items.forEach((cmd, i) => {
      if (cmd.group !== lastGroup) {
        lastGroup = cmd.group;
        const g = document.createElement("li");
        g.className = "cmdk__group";
        g.setAttribute("role", "presentation");
        g.textContent = cmd.group;
        list.append(g);
      }
      const li = document.createElement("li");
      li.id = `cmdk-opt-${i}`;
      li.className = "cmdk__item";
      li.setAttribute("role", "option");
      li.dataset.index = String(i);
      if (cmd.ai) li.classList.add("cmdk__item--ai");
      const label = document.createElement("span");
      label.textContent = cmd.label;
      const hint = document.createElement("small");
      hint.textContent = cmd.hint;
      li.append(label, hint);
      list.append(li);
    });
    if (empty) empty.hidden = items.some((c) => !c.ai);
    select(0);
  };

  const run = (i) => {
    const cmd = items[i];
    if (!cmd) return;
    dialog.close();
    setTimeout(cmd.run, 0);
  };

  const open = () => {
    if (!dialog.open) dialog.showModal();
    input.value = "";
    render();
    input.focus();
  };

  $("cmdk-open-btn")?.addEventListener("click", open);
  $("rail-search-btn")?.addEventListener("click", open);
  input.addEventListener("input", render);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") (ev.preventDefault(), select(index + 1));
    else if (ev.key === "ArrowUp") (ev.preventDefault(), select(index - 1));
    else if (ev.key === "Enter" && !ev.isComposing) (ev.preventDefault(), run(index));
  });
  list.addEventListener("click", (ev) => {
    const row = /** @type {HTMLElement} */ (ev.target).closest("[data-index]");
    if (row) run(Number(row.dataset.index));
  });
  list.addEventListener("mousemove", (ev) => {
    const row = /** @type {HTMLElement} */ (ev.target).closest("[data-index]");
    if (row && Number(row.dataset.index) !== index) select(Number(row.dataset.index));
  });
  document.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") {
      ev.preventDefault();
      dialog.open ? dialog.close() : open();
    }
  });
}

initSidebar();
initComposer();
initPalette();
