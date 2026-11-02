/**
 * REAL-TIME SLACK & GOOGLE AUTHENTICATION CONTROLLER
 * Connects directly to Neon PostgreSQL serverless endpoints (/api/channels, /api/messages).
 * Renders official Google Sign-In button and handles live multi-person chat sync.
 */

import { escapeHtml } from "../domain/taskEntities.mjs";

const GOOGLE_CLIENT_ID = "600439007156-q6ku9a6fnm3dcmbkakgv5fi9b57enm89.apps.googleusercontent.com";

export function initRealtimeSlack({
  onExtractTasksFromMessage,
  showToast
}) {
  let currentUser = null;
  let activeChannelId = "c_general";
  let activeChannelName = "general";
  let channels = [];
  let pollIntervalId = null;

  // DOM Elements
  const userSlot = document.getElementById("slack-user-slot");
  const channelsList = document.getElementById("slack-channels-list");
  const newChannelBtn = document.getElementById("slack-new-channel-btn");
  const channelHeading = document.getElementById("slack-channel-badge");
  const activeChannelTitle = document.getElementById("slack-active-channel-title");
  const activeChannelDesc = document.getElementById("slack-active-channel-desc");
  const messageFeed = document.getElementById("slack-message-feed");
  const composerTextarea = /** @type {HTMLTextAreaElement} */ (document.getElementById("input-message"));
  const composerForm = document.getElementById("analyze-form");
  const newChannelDialog = /** @type {HTMLDialogElement} */ (document.getElementById("new-channel-dialog"));
  const newChannelForm = /** @type {HTMLFormElement} */ (document.getElementById("new-channel-form"));
  const newChannelInput = /** @type {HTMLInputElement} */ (document.getElementById("new-channel-name-input"));
  const newChannelDescInput = /** @type {HTMLInputElement} */ (document.getElementById("new-channel-desc-input"));

  // 1. AUTHENTICATION & GOOGLE IDENTITY SERVICES
  async function checkAuthSession() {
    try {
      const res = await fetch("./api/auth/me");
      const json = await res.json();
      if (json.ok && json.user) {
        currentUser = json.user;
        renderUserStatus();
      } else {
        currentUser = null;
        renderGoogleSignInPrompt();
      }
    } catch {
      currentUser = null;
      renderGoogleSignInPrompt();
    }
  }

  function renderUserStatus() {
    if (!userSlot) return;
    if (!currentUser) {
      renderGoogleSignInPrompt();
      return;
    }

    const avatarHtml = currentUser.avatar_url
      ? `<img src="${escapeHtml(currentUser.avatar_url)}" alt="${escapeHtml(currentUser.full_name)}" class="slack-user-avatar-img" />`
      : `<span class="slack-user-avatar-placeholder">${escapeHtml((currentUser.full_name || "U")[0].toUpperCase())}</span>`;

    userSlot.innerHTML = `
      <div class="slack-user-profile" title="${escapeHtml(currentUser.email)}">
        <div class="slack-user-avatar-wrap">
          ${avatarHtml}
          <span class="slack-presence-dot" aria-label="En línea"></span>
        </div>
        <div class="slack-user-details">
          <strong class="slack-user-name">${escapeHtml(currentUser.full_name)}</strong>
          <span class="slack-user-status">${escapeHtml(currentUser.status_text || "En línea")}</span>
        </div>
        <button type="button" id="slack-logout-btn" class="btn btn--ghost btn--sm" title="Cerrar sesión">Salir</button>
      </div>
    `;

    document.getElementById("slack-logout-btn")?.addEventListener("click", handleLogout);
  }

  function renderGoogleSignInPrompt() {
    if (!userSlot) return;
    userSlot.innerHTML = `
      <div class="google-auth-box">
        <div id="google-btn-container" class="google-btn-slot"></div>
        <span class="google-auth-tip">Inicia sesión con Google para enviar mensajes reales</span>
      </div>
    `;

    loadGoogleScriptAndRender();
  }

  function loadGoogleScriptAndRender() {
    if (typeof window === "undefined") return;

    if (window.google?.accounts?.id) {
      mountGoogleButton();
      return;
    }

    if (!document.getElementById("google-gsi-script")) {
      const script = document.createElement("script");
      script.id = "google-gsi-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = mountGoogleButton;
      document.head.appendChild(script);
    }
  }

  function mountGoogleButton() {
    if (!window.google?.accounts?.id) return;
    const btnContainer = document.getElementById("google-btn-container");
    if (!btnContainer) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true
    });

    window.google.accounts.id.renderButton(btnContainer, {
      type: "standard",
      theme: "outline",
      size: "medium",
      text: "signin_with",
      shape: "pill",
      logo_alignment: "left"
    });
  }

  async function handleGoogleCredentialResponse(response) {
    if (!response?.credential) return;

    showToast("Verificando inicio de sesión con Google...");
    try {
      const res = await fetch("./api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential })
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "No se pudo autenticar.");
      }

      currentUser = json.user;
      renderUserStatus();
      showToast(`¡Bienvenido, ${currentUser.full_name}!`);
      fetchMessages();
    } catch (err) {
      showToast(`Error de autenticación: ${err.message}`);
    }
  }

  async function handleLogout() {
    try {
      await fetch("./api/auth/logout", { method: "POST" });
      currentUser = null;
      renderUserStatus();
      showToast("Sesión cerrada.");
      fetchMessages();
    } catch {
      showToast("Error al cerrar sesión.");
    }
  }

  // 2. CHANNELS MANAGEMENT
  async function fetchChannels() {
    try {
      const res = await fetch("./api/channels");
      const json = await res.json();
      if (json.ok && Array.isArray(json.channels)) {
        channels = json.channels;
        renderChannelsList();
      }
    } catch {
      // Fallback
    }
  }

  function renderChannelsList() {
    if (!channelsList) return;

    channelsList.innerHTML = channels
      .map((c) => {
        const isActive = c.id === activeChannelId;
        return `
          <button
            type="button"
            class="slack-channel-item ${isActive ? "is-active" : ""}"
            data-channel-id="${escapeHtml(c.id)}"
            data-channel-name="${escapeHtml(c.name)}"
            aria-selected="${isActive ? "true" : "false"}"
          >
            <span class="slack-hash">#</span>
            <span class="slack-channel-label">${escapeHtml(c.name)}</span>
            ${c.message_count > 0 ? `<span class="slack-count-badge">${c.message_count}</span>` : ""}
          </button>
        `;
      })
      .join("");
  }

  function selectChannel(channelId, channelName) {
    activeChannelId = channelId;
    activeChannelName = channelName;
    renderChannelsList();

    if (channelHeading) channelHeading.textContent = `#${channelName}`;
    if (activeChannelTitle) activeChannelTitle.textContent = `#${channelName}`;

    const currentChan = channels.find((c) => c.id === channelId);
    if (activeChannelDesc && currentChan) {
      activeChannelDesc.textContent = currentChan.description || "Canal de discusión y tareas en tiempo real.";
    }

    fetchMessages();
  }

  channelsList?.addEventListener("click", (ev) => {
    const btn = /** @type {HTMLElement} */ (ev.target)?.closest(".slack-channel-item");
    if (!btn) return;
    const id = btn.getAttribute("data-channel-id");
    const name = btn.getAttribute("data-channel-name");
    if (id && name) selectChannel(id, name);
  });

  newChannelBtn?.addEventListener("click", () => {
    if (!currentUser) {
      showToast("Inicia sesión con Google para crear canales.");
      return;
    }
    newChannelDialog?.showModal();
    newChannelInput?.focus();
  });

  newChannelForm?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const name = newChannelInput?.value.trim().toLowerCase();
    const desc = newChannelDescInput?.value.trim();
    if (!name) return;

    try {
      const res = await fetch("./api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: desc })
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "No se pudo crear el canal.");
      }

      newChannelDialog?.close();
      if (newChannelInput) newChannelInput.value = "";
      if (newChannelDescInput) newChannelDescInput.value = "";
      showToast(`Canal #${json.channel.name} creado.`);
      await fetchChannels();
      selectChannel(json.channel.id, json.channel.name);
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  });

  // 3. MESSAGES FEED & REAL-TIME POLLING
  async function fetchMessages() {
    if (!messageFeed) return;
    try {
      const res = await fetch(`./api/messages?channelId=${encodeURIComponent(activeChannelId)}`);
      const json = await res.json();
      if (json.ok && Array.isArray(json.messages)) {
        renderMessages(json.messages);
      }
    } catch {
      // Graceful no-op
    }
  }

  function renderMessages(messages) {
    if (!messageFeed) return;

    if (messages.length === 0) {
      messageFeed.innerHTML = `
        <div class="slack-feed-empty">
          <p>Este es el comienzo del canal <strong>#${escapeHtml(activeChannelName)}</strong>.</p>
          <p><small>Envía el primer mensaje o una solicitud para organizar actividades en equipo.</small></p>
        </div>
      `;
      return;
    }

    messageFeed.innerHTML = messages
      .map((msg) => {
        const authorInitial = (msg.author_name || "U")[0].toUpperCase();
        const avatar = msg.author_avatar
          ? `<img src="${escapeHtml(msg.author_avatar)}" alt="${escapeHtml(msg.author_name)}" class="slack-avatar-img" />`
          : `<div class="slack-avatar">${escapeHtml(authorInitial)}</div>`;

        const timeStr = msg.created_at
          ? new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "";

        const reactionsHtml = (msg.reactions || [])
          .map(
            (r) => `
            <button
              type="button"
              class="slack-reaction-btn ${r.userReacted ? "is-reacted" : ""}"
              data-action="toggle-reaction"
              data-msg-id="${escapeHtml(msg.id)}"
              data-emoji="${escapeHtml(r.emoji)}"
              title="Reaccionar con ${escapeHtml(r.emoji)}"
            >
              ${escapeHtml(r.emoji)} <span>${r.count}</span>
            </button>
          `
          )
          .join("");

        return `
          <article class="slack-feed-msg" data-msg-id="${escapeHtml(msg.id)}">
            <div class="slack-msg-header">
              ${avatar}
              <div class="slack-msg-meta">
                <div class="slack-msg-sender-row">
                  <strong class="slack-sender">${escapeHtml(msg.author_name || "Usuario")}</strong>
                  <time class="slack-time">${escapeHtml(timeStr)}</time>
                </div>
                <div class="slack-msg-text">${escapeHtml(msg.text)}</div>
                <div class="slack-msg-actions-row">
                  <div class="slack-reactions-bar">
                    ${reactionsHtml}
                    <button type="button" class="slack-reaction-btn" data-action="quick-react" data-msg-id="${escapeHtml(msg.id)}" data-emoji="👍">👍</button>
                    <button type="button" class="slack-reaction-btn" data-action="quick-react" data-msg-id="${escapeHtml(msg.id)}" data-emoji="🚀">🚀</button>
                    <button type="button" class="slack-reaction-btn" data-action="quick-react" data-msg-id="${escapeHtml(msg.id)}" data-emoji="👀">👀</button>
                    <button type="button" class="slack-reaction-btn" data-action="quick-react" data-msg-id="${escapeHtml(msg.id)}" data-emoji="✅">✅</button>
                  </div>
                  <button
                    type="button"
                    class="btn btn--secondary btn--sm slack-msg-extract-btn"
                    data-action="extract-tasks"
                    data-msg-text="${escapeHtml(msg.text)}"
                    title="Extraer tareas accionables de este mensaje con IA"
                  >
                    ⚡ Extraer a Slack Lists
                  </button>
                </div>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  // Delegated Reactions & Actions in Message Feed
  messageFeed?.addEventListener("click", async (ev) => {
    const btn = /** @type {HTMLElement} */ (ev.target)?.closest("[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");

    if (action === "extract-tasks") {
      const text = btn.getAttribute("data-msg-text");
      if (text && typeof onExtractTasksFromMessage === "function") {
        onExtractTasksFromMessage(text, activeChannelName);
      }
      return;
    }

    if (action === "toggle-reaction" || action === "quick-react") {
      if (!currentUser) {
        showToast("Inicia sesión con Google para reaccionar.");
        return;
      }
      const msgId = btn.getAttribute("data-msg-id");
      const emoji = btn.getAttribute("data-emoji");
      if (!msgId || !emoji) return;

      try {
        const res = await fetch("./api/reactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: msgId, emoji })
        });
        const json = await res.json();
        if (json.ok) {
          fetchMessages();
        }
      } catch {
        // Fallback
      }
    }
  });

  // Sending Real Message from Slack Composer
  async function sendMessage(text) {
    if (!currentUser) {
      showToast("Debes iniciar sesión con Google para enviar mensajes.");
      return false;
    }

    try {
      const res = await fetch("./api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: activeChannelId,
          text
        })
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Error al enviar mensaje");
      }

      showToast("Mensaje enviado al canal.");
      fetchMessages();
      return true;
    } catch (err) {
      showToast(`Error: ${err.message}`);
      return false;
    }
  }

  // Start polling
  checkAuthSession();
  fetchChannels();
  fetchMessages();
  pollIntervalId = setInterval(fetchMessages, 3500);

  return {
    getCurrentUser: () => currentUser,
    getActiveChannel: () => ({ id: activeChannelId, name: activeChannelName }),
    sendMessage,
    refreshMessages: fetchMessages,
    stopPolling: () => clearInterval(pollIntervalId)
  };
}
