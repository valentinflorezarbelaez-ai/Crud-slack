/**
 * CHANNELS — Multi-user personalized sidebar, private spaces & collaborative channels.
 * Pure DOM (no innerHTML) so it stays strict-CSP safe.
 * Scopes personal spaces ("Mi Día", "Mis Proyectos", "Notas & Ideas"), custom channels,
 * workspace title, avatar initials, and direct contacts strictly per authenticated user.
 */

import {
  MAX_CHANNEL_NAME,
  isDemoProfileId,
  loadActiveChannelId,
  loadChannels,
  saveActiveChannelId,
  saveChannels,
  slugifyChannelName
} from "../infrastructure/channelStore.mjs";

const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";

const DEMO_CONTACTS = Object.freeze([
  { name: "Jacobo Flórez", mention: "@Jacobo", presence: "presence--on" },
  { name: "Edison Flórez", mention: "@Edison", presence: "presence--away" },
  { name: "Roberto Urrea", mention: "@Roberto", presence: "" }
]);

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

function extractInitials(rawName) {
  const clean = String(rawName || "").trim();
  if (!clean) return "TF";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

function extractFirstName(user) {
  const full = String(user?.full_name || user?.fullName || user?.email || "").trim();
  if (!full) return "TaskFlow";
  const first = full.split(/[\s@]+/)[0] || "Usuario";
  return first.slice(0, 22);
}

export function isProtectedChannel(ch) {
  if (!ch) return true;
  return (
    ch.id === "general" ||
    ch.name === "general" ||
    ch.kind === "personal" ||
    String(ch.id || "").startsWith("personal") ||
    ch.name === "mi-dia" ||
    ch.name === "mis-proyectos" ||
    ch.name === "notas-ideas"
  );
}

/** Shows the empty-state welcome and hides preset-only or chat panels on personal/custom channels. */
export function syncChannelPanels(channel, isEmpty) {
  const isPersonal = channel.kind === "personal" || String(channel.id || "").startsWith("personal");
  const isCustom = channel.kind === "custom";
  const hidePresets = isCustom || isPersonal;

  const welcome = $("channel-welcome");
  const welcomeTitle = $("channel-welcome-title");
  const welcomeText = $("channel-welcome-text");
  const intakeHeading = $("intake-heading");
  const feed = $("slack-message-feed");

  if (intakeHeading) {
    if (channel.id === "personal-proyectos") {
      intakeHeading.textContent = "Mis Proyectos (Privado) · Entregas y Metas";
    } else if (channel.id === "personal-notas") {
      intakeHeading.textContent = "Notas & Ideas (Privado) · Captura Rápida";
    } else if (isPersonal) {
      intakeHeading.textContent = "Mi Día (Privado) · Planificador por Horas";
    } else {
      intakeHeading.textContent = `Canal #${channel.name} · Chat y Tareas Compartidas`;
    }
  }

  if (welcomeTitle && welcomeText) {
    if (channel.id === "personal-proyectos") {
      welcomeTitle.textContent = "🔒 Mis Proyectos · Solo visible en tu cuenta";
      welcomeText.textContent =
        "Organiza aquí tus proyectos de mediano plazo, estudios o entregables con fechas límite y seguimiento Kanban propio.";
    } else if (channel.id === "personal-notas") {
      welcomeTitle.textContent = "🔒 Notas & Ideas · Tu bloc personal privado";
      welcomeText.textContent =
        "Escribe ideas, pendientes sueltos o recordatorios rápidos; la IA los convierte en ítems accionables aislados en tu cuenta.";
    } else if (isPersonal) {
      welcomeTitle.textContent = "🔒 Mi Día (Privado) · Solo para tus propias tareas";
      welcomeText.textContent =
        "Todo lo que agregues aquí es 100% privado de tu cuenta. Escribe tu plan con horas (ej. «A las 09:00 revisar correos, a las 11:30 reunión de avance y a las 16:00 entregar reporte») para activar tu agenda horaria y alarmas.";
    } else {
      welcomeTitle.replaceChildren(
        document.createTextNode("Este es el comienzo de tu canal "),
        Object.assign(span("", `#${channel.name}`), { id: "channel-welcome-name" })
      );
      welcomeText.textContent =
        "Solo tú y las personas a quienes envíes el botón «🔗 Invitar» ven los mensajes y tareas de este canal.";
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
  let currentUser = null;
  let realTeammates = [];
  let channels = loadChannels(null);
  let activeId = loadActiveChannelId(null);
  if (!channels.some((c) => c.id === activeId)) activeId = "personal";
  let editingId = null;

  const list = $("sidebar-channels");
  const dmsList = $("sidebar-dms");
  const workspaceNameEl = document.querySelector(".sidebar-workspace__name");
  const railBadgeEl = document.querySelector(".rail-workspace");
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
  const persist = () => saveChannels(channels, currentUser?.id || null);

  function syncWorkspaceIdentity() {
    if (workspaceNameEl) {
      workspaceNameEl.textContent = currentUser
        ? `Espacio de ${extractFirstName(currentUser)}`
        : "TaskFlow AI";
    }
    if (railBadgeEl) {
      railBadgeEl.textContent = currentUser
        ? extractInitials(currentUser.full_name || currentUser.email)
        : "TF";
    }
  }

  function renderTeammates() {
    if (!dmsList) return;
    dmsList.replaceChildren();

    if (!currentUser) {
      const li = document.createElement("li");
      const emptyNote = span("sidebar-dms-empty", "Inicia sesión para ver contactos");
      li.append(emptyNote);
      dmsList.append(li);
      return;
    }

    if (isDemoProfileId(currentUser.id)) {
      for (const peer of DEMO_CONTACTS) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sidebar-item";
        btn.dataset.mention = peer.mention;
        const dot = span(`presence ${peer.presence}`.trim());
        dot.setAttribute("aria-hidden", "true");
        btn.append(dot, span("sidebar-item__name", peer.name));
        li.append(btn);
        dmsList.append(li);
      }
      return;
    }

    if (realTeammates.length === 0) {
      const li = document.createElement("li");
      const hintBtn = document.createElement("button");
      hintBtn.type = "button";
      hintBtn.className = "sidebar-item sidebar-item--muted";
      hintBtn.title = "Crea un canal y usa 🔗 Invitar para colaborar con otra persona";
      hintBtn.append(
        span("sidebar-item__hash", "+"),
        span("sidebar-item__name", "Invita personas en un #canal")
      );
      hintBtn.addEventListener("click", () => {
        const active = getActive();
        if (active && active.kind === "custom") {
          $("invite-channel-btn")?.click();
        } else {
          openDialog(null);
        }
      });
      li.append(hintBtn);
      dmsList.append(li);
      return;
    }

    for (const mate of realTeammates) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sidebar-item";
      const firstName = String(mate.full_name || "Usuario").split(/\s+/)[0];
      btn.dataset.mention = `@${firstName}`;
      btn.title = mate.status_text || "Colaborador en canal compartido";
      const dot = span("presence presence--on");
      dot.setAttribute("aria-hidden", "true");
      btn.append(dot, span("sidebar-item__name", mate.full_name || "Colaborador"));
      li.append(btn);
      dmsList.append(li);
    }
  }

  function renderMembers(channel) {
    if (!members) return;
    members.replaceChildren();
    const selfInit = currentUser ? extractInitials(currentUser.full_name || currentUser.email) : "TÚ";
    if (channel.kind === "personal" || String(channel.id || "").startsWith("personal")) {
      members.setAttribute("aria-label", "Espacio personal privado: solo tú");
      members.append(span("", "🔒"), span("", selfInit));
      return;
    }
    if (channel.kind === "custom") {
      members.setAttribute("aria-label", "Miembros del canal");
      members.append(span("", selfInit));
      for (const mate of realTeammates.slice(0, 3)) {
        members.append(span("", extractInitials(mate.full_name)));
      }
      return;
    }
    members.setAttribute("aria-label", "4 miembros en modo demostración");
    members.append(span("", "VF"), span("", "JF"), span("", "EF"), span("", "RU"));
  }

  function render() {
    if (!list) return;
    list.replaceChildren();

    const personalItems = channels.filter((c) => c.kind === "personal");
    const sharedItems = channels.filter((c) => c.kind !== "personal");

    const appendChannelItem = (ch) => {
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
        btn.append(span("sr-only", "espacio privado"));
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
    };

    for (const ch of personalItems) appendChannelItem(ch);

    if (sharedItems.length > 0) {
      const sep = document.createElement("li");
      sep.className = "sidebar-sublabel";
      sep.setAttribute("role", "presentation");
      sep.textContent = isDemoProfileId(currentUser?.id)
        ? "Canales de demostración"
        : "Tus canales compartidos";
      list.append(sep);
      for (const ch of sharedItems) appendChannelItem(ch);
    }
  }

  function syncSettingsButton() {
    const active = getActive();
    const canDelete = !isProtectedChannel(active);
    const isPersonal = active.kind === "personal" || String(active.id || "").startsWith("personal");

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
      channels.find(
        (c) => c.id === id || c.id === normalizedTarget || c.name === normalizedTarget
      ) || null;
    if (!next) return;
    activeId = next.id;
    next.unread = 0;
    saveActiveChannelId(activeId, currentUser?.id || null);
    persist();
    render();
    syncSettingsButton();
    onActivate(next, opts);
  }

  async function refreshRemoteUserChannels() {
    if (!currentUser?.id || typeof fetch !== "function") return;
    const requestedUserId = currentUser.id;
    try {
      const res = await fetch(`./api/channels?userId=${encodeURIComponent(requestedUserId)}`, {
        credentials: "same-origin"
      });
      const json = await res.json();
      if (!currentUser || currentUser.id !== requestedUserId) return;

      if (json.ok) {
        realTeammates = Array.isArray(json.teammates) ? json.teammates : [];
        renderTeammates();

        if (Array.isArray(json.channels)) {
          let changed = false;
          for (const rem of json.channels) {
            if (!rem || !rem.name || isProtectedChannel({ id: rem.id, name: rem.name, kind: "custom" })) {
              if (rem?.name !== "general") continue;
              if (!isDemoProfileId(requestedUserId)) continue;
            }
            if (rem.name === "general" && isDemoProfileId(requestedUserId)) continue;

            const existing = channels.find((c) => c.id === rem.id || (c.kind === "custom" && c.name === rem.name));
            if (!existing) {
              channels.push({
                id: rem.id || rem.name,
                name: rem.name,
                label: rem.name,
                topic: rem.description || "",
                kind: "custom",
                presetId: null,
                isPrivate: Boolean(rem.is_private),
                unread: 0
              });
              changed = true;
            } else if (rem.id && existing.id !== rem.id && existing.kind === "custom") {
              const wasActive = activeId === existing.id;
              existing.id = rem.id;
              if (wasActive) {
                activeId = rem.id;
                saveActiveChannelId(activeId, currentUser.id);
              }
              changed = true;
            }
          }
          if (changed) {
            persist();
            render();
          }
        }
        syncSettingsButton();
      }
    } catch {
      // Offline fallback: local user-scoped channels remain intact
    }
  }

  function setUserContext(user, opts = {}) {
    currentUser = user || null;
    realTeammates = [];
    syncWorkspaceIdentity();

    channels = loadChannels(currentUser?.id || null);
    const savedActive = loadActiveChannelId(currentUser?.id || null);
    if (opts.forcePersonal || !channels.some((c) => c.id === savedActive)) {
      activeId = "personal";
    } else {
      activeId = savedActive;
    }

    render();
    renderTeammates();
    syncSettingsButton();
    onActivate(getActive(), { initial: true });

    if (currentUser?.id) {
      void refreshRemoteUserChannels();
    }
  }

  function upsertJoinedChannel(channelMeta) {
    if (!channelMeta) return;
    const chId = String(channelMeta.id || channelMeta.channelId || "").trim();
    const rawName = String(channelMeta.name || chId.replace(/^c_/, "").split("_")[0] || "canal").trim();
    if (!chId) return;

    let existing = channels.find((c) => c.id === chId);
    if (!existing) {
      existing = {
        id: chId,
        name: rawName,
        label: rawName,
        topic: channelMeta.description || "Canal compartido por invitación",
        kind: "custom",
        presetId: null,
        isPrivate: Boolean(channelMeta.is_private),
        unread: 0
      };
      channels = [...channels, existing];
      persist();
      render();
    }
    activate(existing.id);
    void refreshRemoteUserChannels();
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
    if (
      slug === "personal" ||
      slug === "mi-dia" ||
      slug.startsWith("personal-") ||
      slug === "mis-proyectos" ||
      slug === "notas-ideas"
    ) {
      return "Ese nombre está reservado para tus secciones personales privadas.";
    }
    const clash = channels.some((c) => c.name === slug && c.id !== editingId);
    if (clash) return `Ya tienes un canal llamado #${slug} en tu espacio.`;
    return "";
  }

  function openDialog(channel) {
    if (!dialog || !form || !nameInput || !topicInput) return;
    editingId = channel ? channel.id : null;
    form.reset();
    setError("");
    if (title) title.textContent = channel ? "Editar canal" : "Crear un canal en tu espacio";
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

  form?.addEventListener("submit", async (ev) => {
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
      dialog?.close();
      return;
    }

    let remoteId = `c_${slug.replace(/-/g, "_")}_${Date.now().toString(36)}`;
    try {
      const res = await fetch("./api/channels", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: slug,
          description: topic,
          isPrivate,
          userId: currentUser?.id || null
        })
      });
      const json = await res.json().catch(() => null);
      if (res.status === 409 && json?.error) {
        setError(json.error);
        nameInput.focus();
        return;
      }
      if (json?.ok && json.channel?.id) {
        remoteId = json.channel.id;
      }
    } catch {
      // Offline fallback uses unique client-generated channel ID
    }

    const created = {
      id: remoteId,
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
    showToast(`Canal #${slug} creado en tu espacio. Usa 🔗 Invitar si deseas compartirlo.`);
  });

  $("channel-cancel-btn")?.addEventListener("click", () => dialog?.close());
  $("channel-close-btn")?.addEventListener("click", () => dialog?.close());

  async function performChannelDeletion(target) {
    if (!target || isProtectedChannel(target)) {
      showToast("Las listas personales privadas están protegidas y no pueden eliminarse.");
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

    try {
      const params = new URLSearchParams({
        channelId: target.id,
        name: target.name
      });
      if (currentUser?.id) params.set("userId", currentUser.id);
      await fetch(`./api/channels?${params.toString()}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
    } catch {
      // Local removal already succeeded
    }

    if (wasActive) activate("personal");
    else render();
    syncSettingsButton();
    showToast(`Canal #${target.name} eliminado de tu espacio.`);
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

  syncWorkspaceIdentity();
  render();
  renderTeammates();
  syncSettingsButton();

  return {
    getActive,
    getChannels: () => channels,
    activate,
    setUserContext,
    upsertJoinedChannel,
    refreshRemoteUserChannels,
    findByPresetId: (presetId) => channels.find((c) => c.presetId === presetId) || null,
    openCreateDialog: () => openDialog(null),
    openEditDialog: () => {
      const active = getActive();
      if (active.kind === "custom") openDialog(active);
    },
    maxNameLength: MAX_CHANNEL_NAME
  };
}
