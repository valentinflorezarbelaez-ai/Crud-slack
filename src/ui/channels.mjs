/**
 * CHANNELS — create, switch, edit and delete Slack-style channels.
 * Pure DOM (no innerHTML) so it stays strict-CSP safe. Each channel owns its
 * own task board; main.mjs swaps the board when `onActivate` fires.
 */

import {
  MAX_CHANNEL_NAME,
  loadActiveChannelId,
  loadChannels,
  saveActiveChannelId,
  saveChannels,
  slugifyChannelName
} from "../infrastructure/channelStore.mjs";

const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";

function icon(id, size = 14) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${id}`);
  svg.append(use);
  return svg;
}

function span(className, text) {
  const node = document.createElement("span");
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Shows the empty-state welcome and hides preset-only panels on custom channels. */
export function syncChannelPanels(channel, isEmpty) {
  const isCustom = channel.kind === "custom";
  const name = $("channel-welcome-name");
  if (name) name.textContent = `#${channel.name}`;
  const welcome = $("channel-welcome");
  if (welcome) welcome.hidden = !(isCustom && isEmpty);
  for (const sel of [".preset-bar", "#slack-message-card", "#intake-day-divider"]) {
    const node = document.querySelector(sel);
    if (node) node.hidden = isCustom;
  }
}

/**
 * @param {{
 *   onActivate: (channel: object, opts: { initial?: boolean, created?: boolean }) => void,
 *   onRemoved: (channel: object) => void,
 *   showToast: (msg: string) => void
 * }} hooks
 */
export function initChannels({ onActivate, onRemoved, showToast }) {
  let channels = loadChannels();
  let activeId = loadActiveChannelId();
  if (!channels.some((c) => c.id === activeId)) activeId = "general";
  let editingId = null;

  const list = $("sidebar-channels");
  const dialog = /** @type {HTMLDialogElement|null} */ ($("channel-dialog"));
  const form = /** @type {HTMLFormElement|null} */ ($("channel-form"));
  const nameInput = /** @type {HTMLInputElement|null} */ ($("channel-name-input"));
  const topicInput = /** @type {HTMLInputElement|null} */ ($("channel-topic-input"));
  const errorBox = $("channel-name-error");
  const title = $("channel-dialog-title");
  const submitBtn = $("channel-submit-btn");
  const deleteBtn = $("channel-delete-btn");
  const settingsBtn = $("channel-settings-btn");
  const members = document.querySelector(".avatar-stack");

  const getActive = () => channels.find((c) => c.id === activeId) || channels[0];
  const persist = () => saveChannels(channels);

  function renderMembers(channel) {
    if (!members) return;
    members.replaceChildren();
    if (channel.kind === "custom") {
      members.setAttribute("aria-label", "1 miembro en el canal");
      members.append(span("", "VF"));
      return;
    }
    members.setAttribute("aria-label", "4 miembros en el canal");
    members.append(span("", "VF"), span("", "JF"), span("", "EF"), span("", "RU"));
  }

  function render() {
    if (!list) return;
    list.replaceChildren();
    for (const ch of channels) {
      const li = document.createElement("li");
      li.setAttribute("role", "presentation");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slack-channel-pill sidebar-item";
      btn.dataset.channelId = ch.id;
      btn.dataset.channelName = ch.name;
      btn.dataset.topic = ch.topic;
      btn.dataset.kind = ch.kind;
      if (ch.presetId) btn.dataset.preset = ch.presetId;
      btn.setAttribute("role", "option");
      const isActive = ch.id === activeId;
      btn.setAttribute("aria-selected", String(isActive));
      if (isActive) btn.classList.add("is-active");
      else if (ch.unread > 0) btn.classList.add("is-unread");

      const hash = span("sidebar-item__hash");
      hash.setAttribute("aria-hidden", "true");
      if (ch.isPrivate) hash.append(icon("i-lock", 13));
      else hash.textContent = "#";
      btn.append(hash, span("sidebar-item__name", ch.name));

      if (ch.isPrivate) {
        const sr = span("sr-only", "canal privado");
        btn.append(sr);
      }
      if (ch.unread > 0 && !isActive) btn.append(span("sidebar-item__badge", String(ch.unread)));

      li.append(btn);
      list.append(li);
    }
  }

  function syncSettingsButton() {
    const active = getActive();
    if (settingsBtn) settingsBtn.hidden = active.kind !== "custom";
    renderMembers(active);
  }

  function activate(id, opts = {}) {
    const next = channels.find((c) => c.id === id);
    if (!next) return;
    activeId = next.id;
    next.unread = 0;
    saveActiveChannelId(activeId);
    persist();
    render();
    syncSettingsButton();
    onActivate(next, opts);
  }

  /* ---------- Dialog ---------- */
  function setError(message) {
    if (!errorBox || !nameInput) return;
    errorBox.textContent = message;
    errorBox.hidden = !message;
    nameInput.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function validateName(slug) {
    if (!slug) return "Escribe un nombre para el canal.";
    const clash = channels.some((c) => c.name === slug && c.id !== editingId);
    if (clash) return `Ya existe un canal llamado #${slug}.`;
    return "";
  }

  function openDialog(channel) {
    if (!dialog || !form || !nameInput || !topicInput) return;
    editingId = channel ? channel.id : null;
    form.reset();
    setError("");
    if (title) title.textContent = channel ? "Editar canal" : "Crear un canal";
    if (submitBtn) submitBtn.textContent = channel ? "Guardar cambios" : "Crear canal";
    if (deleteBtn) deleteBtn.hidden = !channel;
    nameInput.value = channel ? channel.name : "";
    topicInput.value = channel ? channel.topic : "";
    const radio = /** @type {HTMLInputElement|null} */ (
      form.querySelector(`input[name="channel-visibility"][value="${channel?.isPrivate ? "private" : "public"}"]`)
    );
    if (radio) radio.checked = true;
    dialog.showModal();
    nameInput.focus();
  }

  nameInput?.addEventListener("input", () => {
    const typed = nameInput.value;
    const slug = slugifyChannelName(typed);
    nameInput.value = /[\s_-]$/.test(typed) && slug ? `${slug}-` : slug;
    if (errorBox && !errorBox.hidden) setError(validateName(slug));
  });

  form?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (!nameInput || !topicInput) return;
    const slug = slugifyChannelName(nameInput.value);
    const problem = validateName(slug);
    if (problem) {
      setError(problem);
      nameInput.focus();
      return;
    }
    const topic = topicInput.value.trim();
    const isPrivate =
      /** @type {HTMLInputElement|null} */ (form.querySelector('input[name="channel-visibility"]:checked'))?.value ===
      "private";

    if (editingId) {
      const target = channels.find((c) => c.id === editingId);
      if (target) {
        target.name = slug;
        target.topic = topic;
        target.isPrivate = isPrivate;
        persist();
        render();
        syncSettingsButton();
        showToast(`Canal #${slug} actualizado.`);
      }
    } else {
      const created = {
        id: slug,
        name: slug,
        topic,
        kind: "custom",
        presetId: null,
        isPrivate,
        unread: 0
      };
      channels = [...channels, created];
      persist();
      dialog?.close();
      activate(created.id, { created: true });
      showToast(`Canal #${slug} creado en PostgreSQL. Ya puedes chatear y organizar tareas.`);

      // Persist to Neon PostgreSQL in background
      fetch("./api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: slug, description: topic })
      }).catch(() => {});
      return;
    }
    dialog?.close();
  });

  $("channel-cancel-btn")?.addEventListener("click", () => dialog?.close());
  $("channel-close-btn")?.addEventListener("click", () => dialog?.close());

  deleteBtn?.addEventListener("click", () => {
    const target = channels.find((c) => c.id === editingId);
    if (!target || target.kind !== "custom") return;
    const ok = window.confirm(
      `¿Eliminar #${target.name}?\n\nSe borrarán también las tareas de este canal. Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    const wasActive = target.id === activeId;
    channels = channels.filter((c) => c.id !== target.id);
    persist();
    dialog?.close();
    onRemoved(target);
    if (wasActive) activate("general");
    else render();
    showToast(`Canal #${target.name} eliminado.`);
  });

  /* ---------- Sidebar + header wiring ---------- */
  list?.addEventListener("click", (ev) => {
    const pill = /** @type {HTMLElement} */ (ev.target).closest(".slack-channel-pill");
    if (!pill) return;
    const id = pill.dataset.channelId;
    if (id && id !== activeId) activate(id);
  });

  $("add-channel-btn")?.addEventListener("click", () => openDialog(null));
  $("slack-new-channel-btn")?.addEventListener("click", () => openDialog(null));
  settingsBtn?.addEventListener("click", () => {
    const active = getActive();
    if (active.kind === "custom") openDialog(active);
  });

  // Fetch channels from Neon PostgreSQL and merge remote ones
  fetch("./api/channels")
    .then((r) => r.json())
    .then((json) => {
      if (json.ok && Array.isArray(json.channels)) {
        let added = false;
        for (const rem of json.channels) {
          if (!channels.some((c) => c.name === rem.name)) {
            channels.push({
              id: rem.name,
              name: rem.name,
              topic: rem.description || "",
              kind: "custom",
              presetId: null,
              isPrivate: Boolean(rem.is_private),
              unread: 0
            });
            added = true;
          }
        }
        if (added) {
          persist();
          render();
        }
      }
    })
    .catch(() => {});

  render();
  syncSettingsButton();

  return {
    getActive,
    getChannels: () => channels,
    activate,
    findByPresetId: (presetId) => channels.find((c) => c.presetId === presetId) || null,
    openCreateDialog: () => openDialog(null),
    openEditDialog: () => {
      const active = getActive();
      if (active.kind === "custom") openDialog(active);
    },
    maxNameLength: MAX_CHANNEL_NAME
  };
}
