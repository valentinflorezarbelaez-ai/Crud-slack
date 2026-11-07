/**
 * CHANNELS — create, switch, edit and delete Slack-style channels + "Mi Día (Privado)".
 * Pure DOM (no innerHTML) so it stays strict-CSP safe. Each channel owns its
 * own task board; "personal" ("Mi Día (Privado)") is strictly isolated per user.
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

export function isProtectedChannel(ch) {
  if (!ch) return true;
  return (
    ch.id === "general" ||
    ch.name === "general" ||
    ch.id === "personal" ||
    ch.kind === "personal" ||
    ch.name === "mi-dia"
  );
}

/** Shows the empty-state welcome and hides preset-only or chat panels on personal/custom channels. */
export function syncChannelPanels(channel, isEmpty) {
  const isPersonal = channel.kind === "personal" || channel.id === "personal";
  const isCustom = channel.kind === "custom";
  const hidePresets = isCustom || isPersonal;

  const welcome = $("channel-welcome");
  const welcomeTitle = $("channel-welcome-title");
  const welcomeText = $("channel-welcome-text");
  const intakeHeading = $("intake-heading");
  const feed = $("slack-message-feed");

  if (intakeHeading) {
    intakeHeading.textContent = isPersonal
      ? "Mi Día (Privado) · Planificador por Horas"
      : "Canal Slack & Mensaje Recibido";
  }

  if (welcomeTitle && welcomeText) {
    if (isPersonal) {
      welcomeTitle.textContent = "🔒 Mi Día (Privado) · Solo para tus propias tareas";
      welcomeText.textContent =
        "Todo lo que agregues aquí es 100% privado de tu cuenta. Escribe tu plan con horas (ej. «A las 09:00 revisar correos, a las 11:30 reunión de avance y a las 16:00 entregar reporte») para activar tu agenda horaria y notificaciones.";
    } else {
      welcomeTitle.replaceChildren(
        document.createTextNode("Este es el comienzo del canal "),
        Object.assign(span("", `#${channel.name}`), { id: "channel-welcome-name" })
      );
      welcomeText.textContent =
        "Pega o escribe un mensaje abajo y la IA lo convertirá en tareas para este canal. Cada canal tiene su propia lista.";
    }
  }

  if (welcome) welcome.hidden = !(hidePresets && isEmpty);
  if (feed) feed.hidden = isPersonal;

  for (const sel of [".preset-bar", "#slack-message-card", "#intake-day-divider"]) {
    const node = document.querySelector(sel);
    if (node) node.hidden = hidePresets;
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
  if (!channels.some((c) => c.id === activeId)) activeId = "personal";
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
  const deleteHeaderBtn = $("channel-delete-header-btn");
  const inviteBtn = $("invite-channel-btn");
  const headerName = $("channel-header-name");
  const headerTopic = $("channel-header-topic");
  const headerHash = document.querySelector(".channel-header__hash");
  const members = document.querySelector(".avatar-stack");

  const getActive = () => channels.find((c) => c.id === activeId) || channels[0];
  const persist = () => saveChannels(channels);

  function renderMembers(channel) {
    if (!members) return;
    members.replaceChildren();
    if (channel.kind === "personal" || channel.id === "personal") {
      members.setAttribute("aria-label", "Espacio personal privado: solo tú");
      members.append(span("", "🔒"));
      return;
    }
    if (channel.kind === "custom") {
      members.setAttribute("aria-label", "Canal colaborativo");
      members.append(span("", "EQ"));
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
      btn.className =
        ch.kind === "personal"
          ? "slack-channel-pill sidebar-item sidebar-item--personal"
          : "slack-channel-pill sidebar-item";
      btn.dataset.channelId = ch.id;
      btn.dataset.channelName = ch.label || ch.name;
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
      btn.append(hash, span("sidebar-item__name", ch.label || ch.name));

      if (ch.isPrivate) {
        const sr = span("sr-only", "espacio privado");
        btn.append(sr);
      }
      if (ch.unread > 0 && !isActive) btn.append(span("sidebar-item__badge", String(ch.unread)));

      if (!isProtectedChannel(ch)) {
        const delBtn = document.createElement("span");
        delBtn.className = "sidebar-item__del";
        delBtn.title = `Eliminar #${ch.name}`;
        delBtn.setAttribute("aria-label", `Eliminar canal #${ch.name}`);
        delBtn.setAttribute("role", "button");
        delBtn.tabIndex = 0;
        delBtn.textContent = "×";
        const triggerDel = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          performChannelDeletion(ch);
        };
        delBtn.addEventListener("click", triggerDel);
        delBtn.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") triggerDel(ev);
        });
        btn.append(delBtn);
      }

      li.append(btn);
      list.append(li);
    }
  }

  function syncSettingsButton() {
    const active = getActive();
    const canDelete = !isProtectedChannel(active);
    const isPersonal = active.kind === "personal" || active.id === "personal";

    if (headerName) headerName.textContent = active.label || active.name;
    if (headerTopic) headerTopic.textContent = active.topic || "Canal colaborativo de tareas.";
    if (headerHash) headerHash.textContent = active.isPrivate ? "🔒 " : "#";

    if (settingsBtn) settingsBtn.hidden = active.kind !== "custom";
    if (deleteHeaderBtn) deleteHeaderBtn.hidden = !canDelete;
    if (inviteBtn) inviteBtn.hidden = isPersonal;
    renderMembers(active);
  }

  function activate(id, opts = {}) {
    const normalizedTarget = String(id || "").replace(/^c_/, "");
    const next =
      channels.find((c) => c.id === id || c.id === normalizedTarget || c.name === normalizedTarget) || null;
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
    if (slug === "personal" || slug === "mi-dia") {
      return "Ese nombre está reservado para tu sección privada Mi Día.";
    }
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
    if (deleteBtn) deleteBtn.hidden = !channel || isProtectedChannel(channel);
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
        target.label = slug;
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
        label: slug,
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

  async function performChannelDeletion(target) {
    if (!target || isProtectedChannel(target)) {
      showToast("Este espacio está protegido y no puede ser eliminado.");
      return;
    }
    const ok = window.confirm(
      `¿Eliminar el canal #${target.name}?\n\nSe borrarán permanentemente sus tareas y mensajes. Esta acción no se puede deshacer.`
    );
    if (!ok) return;

    const wasActive = target.id === activeId;
    channels = channels.filter((c) => c.id !== target.id);
    persist();
    dialog?.close();
    onRemoved(target);

    // Call DELETE API to purge from Neon PostgreSQL
    try {
      await fetch(`./api/channels?channelId=${encodeURIComponent(target.id)}&name=${encodeURIComponent(target.name)}`, {
        method: "DELETE"
      });
    } catch {
      // Local removal already succeeded
    }

    if (wasActive) activate("general");
    else render();
    syncSettingsButton();
    showToast(`Canal #${target.name} eliminado exitosamente.`);
  }

  deleteBtn?.addEventListener("click", () => {
    const target = channels.find((c) => c.id === editingId);
    if (target) performChannelDeletion(target);
  });

  deleteHeaderBtn?.addEventListener("click", () => {
    const active = getActive();
    if (active) performChannelDeletion(active);
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
          if (rem.name === "personal" || rem.name === "mi-dia") continue;
          if (!channels.some((c) => c.name === rem.name)) {
            channels.push({
              id: rem.name,
              name: rem.name,
              label: rem.name,
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
