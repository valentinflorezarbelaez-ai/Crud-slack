/**
 * REAL-TIME SLACK, TEAM AUTH GATE & GOOGLE AUTHENTICATION CONTROLLER
 * Connects directly to Neon PostgreSQL serverless endpoints (/api/channels, /api/messages).
 * Manages dedicated Slack Auth Gate (4 Team Profiles + Google OAuth) and real-time chat sync.
 */

import { escapeHtml } from "../domain/taskEntities.mjs";

/** Resolve GIS client id from host env via fail-closed API — never hardcode. */
let cachedGoogleClientId = "";
async function resolveGoogleClientId() {
  if (cachedGoogleClientId) return cachedGoogleClientId;
  const res = await fetch("/api/auth/google-client", { credentials: "same-origin" });
  if (!res.ok) throw new Error("GOOGLE_CLIENT_ID_REQUIRED");
  const body = await res.json().catch(() => ({}));
  const id = typeof body.clientId === "string" ? body.clientId.trim() : "";
  if (!id) throw new Error("GOOGLE_CLIENT_ID_REQUIRED");
  cachedGoogleClientId = id;
  return id;
}

const makeAvatarSvg = (initials, bg, fg = "#ffffff") =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="24" fill="${bg}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="${fg}" font-family="Segoe UI,system-ui,sans-serif" font-size="16" font-weight="700">${initials}</text></svg>`
  )}`;

export const TEAM_PROFILES = Object.freeze({
  usr_valentin: {
    id: "usr_valentin",
    full_name: "Valentín Flórez Arbelaez",
    email: "valentin.florez@crud-slack.internal",
    avatar_url: makeAvatarSvg("VF", "#4A154B", "#FFFFFF"),
    status_text: "Coordinador General · Activo"
  },
  usr_ana: {
    id: "usr_ana",
    full_name: "Jacobo Flórez Galeano",
    email: "jacobo.florez@crud-slack.internal",
    avatar_url: makeAvatarSvg("JF", "#007A5A", "#FFFFFF"),
    status_text: "Diseño UX/UI · Activo"
  },
  usr_carlos: {
    id: "usr_carlos",
    full_name: "Edison Flórez López",
    email: "edison.florez@crud-slack.internal",
    avatar_url: makeAvatarSvg("EF", "#1264A3", "#FFFFFF"),
    status_text: "Ingeniero Backend · Activo"
  },
  usr_elena: {
    id: "usr_elena",
    full_name: "Roberto Urrea",
    email: "roberto.urrea@crud-slack.internal",
    avatar_url: makeAvatarSvg("RU", "#ECB22E", "#1D1C1D"),
    status_text: "QA & Testing · Activo"
  }
});

export function initRealtimeSlack({
  onExtractTasksFromMessage,
  onUserChanged,
  showToast
}) {
  let currentUser = null;
  let activeChannelId = "general";
  let activeChannelName = "general";
  let pollIntervalId = null;

  // DOM Elements
  const authGate = document.getElementById("slack-auth-gate");
  const authCloseBtn = document.getElementById("slack-auth-close-btn");
  const authGuestBtn = document.getElementById("slack-auth-guest-btn");
  const teamUsersGrid = document.getElementById("team-users-grid");
  const userSlot = document.getElementById("slack-user-slot");
  const channelHeading = document.getElementById("slack-channel-badge");
  const activeChannelTitle = document.getElementById("slack-active-channel-title");
  const activeChannelDesc = document.getElementById("slack-active-channel-desc");
  const messageFeed = document.getElementById("slack-message-feed");

  // 1. AUTHENTICATION & TEAM AUTH GATEWAY
  function renderTeamUsersGrid() {
    if (!teamUsersGrid) return;
    teamUsersGrid.innerHTML = Object.values(TEAM_PROFILES)
      .map(
        (u) => `
        <button type="button" class="team-user-card" data-user-id="${escapeHtml(u.id)}" role="listitem" aria-label="Entrar como ${escapeHtml(u.full_name)}">
          <img src="${escapeHtml(u.avatar_url)}" alt="" class="team-user-avatar" width="42" height="42" decoding="async" />
          <div class="team-user-info">
            <strong class="team-user-name">${escapeHtml(u.full_name)}</strong>
            <span class="team-user-role">${escapeHtml(u.status_text)}</span>
          </div>
        </button>
      `
      )
      .join("");
  }

  async function checkAuthSession() {
    try {
      const res = await fetch("./api/auth/me");
      const json = await res.json();
      if (json.ok && json.user) {
        currentUser = json.user;
        try {
          localStorage.setItem("taskflow_slack_user", JSON.stringify(currentUser));
        } catch {}
        renderUserStatus();
        onUserChanged?.(currentUser);
      }
    } catch {
      // Gracefully silent: user already has instant local profile active
    }
  }

  function showAuthGate() {
    if (authGate) authGate.hidden = false;
    renderTeamUsersGrid();
    loadGoogleScriptAndRender();
  }

  function hideAuthGate() {
    if (authGate) authGate.hidden = true;
  }

  function loginAsUser(user) {
    if (!user) return;
    currentUser = user;
    try {
      localStorage.setItem("taskflow_slack_user", JSON.stringify(user));
    } catch {}
    hideAuthGate();
    renderUserStatus();
    onUserChanged?.(currentUser);
    showToast(`¡Bienvenido a Slack, ${currentUser.full_name}!`);
    fetchMessages();

    // Persist session cookie in background
    fetch("./api/auth/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id })
    }).catch(() => {});
  }

  // Click on any team user profile card
  teamUsersGrid?.addEventListener("click", (ev) => {
    const card = /** @type {HTMLElement} */ (ev.target)?.closest(".team-user-card");
    if (!card) return;
    const userId = card.getAttribute("data-user-id");
    if (!userId) return;

    const profile = TEAM_PROFILES[userId] || {
      id: userId,
      full_name: card.querySelector(".team-user-name")?.textContent || "Usuario",
      avatar_url: card.querySelector(".team-user-avatar")?.getAttribute("src") || "",
      status_text: card.querySelector(".team-user-role")?.textContent || "Miembro del equipo"
    };

    loginAsUser(profile);
  });

  // Direct bypass button
  authGuestBtn?.addEventListener("click", () => {
    loginAsUser(TEAM_PROFILES.usr_valentin);
  });

  // Close modal button
  authCloseBtn?.addEventListener("click", () => {
    if (!currentUser) loginAsUser(TEAM_PROFILES.usr_valentin);
    else hideAuthGate();
  });

  // Backdrop click or Escape key
  authGate?.addEventListener("click", (ev) => {
    if (ev.target === authGate) {
      if (!currentUser) loginAsUser(TEAM_PROFILES.usr_valentin);
      else hideAuthGate();
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && authGate && !authGate.hidden) {
      if (!currentUser) loginAsUser(TEAM_PROFILES.usr_valentin);
      else hideAuthGate();
    }
  });

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
      <div class="slack-user-profile" title="${escapeHtml(currentUser.email || currentUser.full_name)}">
        <div class="slack-user-avatar-wrap">
          ${avatarHtml}
          <span class="slack-presence-dot" aria-label="En línea"></span>
        </div>
        <div class="slack-user-details">
          <strong class="slack-user-name">${escapeHtml(currentUser.full_name)}</strong>
          <span class="slack-user-status">${escapeHtml(currentUser.status_text || "En línea")}</span>
        </div>
        <button type="button" id="slack-switch-user-btn" class="slack-switch-user-btn" title="Cambiar entre los 4 usuarios del equipo">Cambiar</button>
        <button type="button" id="slack-logout-btn" class="btn btn--ghost btn--sm" title="Cerrar sesión">Salir</button>
      </div>
    `;

    document.getElementById("slack-switch-user-btn")?.addEventListener("click", () => showAuthGate());
    document.getElementById("slack-logout-btn")?.addEventListener("click", handleLogout);
  }

  function renderGoogleSignInPrompt() {
    if (!userSlot) return;
    userSlot.innerHTML = `
      <div class="google-auth-box">
        <div id="google-btn-container" class="google-btn-slot"></div>
        <button type="button" id="slack-open-gate-btn" class="slack-switch-user-btn" style="margin-top:0.35rem">
          Elegir perfil de equipo (4 usuarios)
        </button>
      </div>
    `;

    document.getElementById("slack-open-gate-btn")?.addEventListener("click", () => showAuthGate());
    loadGoogleScriptAndRender();
  }

  let googleMountStarted = false;
  function loadGoogleScriptAndRender() {
    if (typeof window === "undefined") return;

    const tryMount = () => {
      if (!window.google?.accounts?.id) return false;
      if (googleMountStarted) return true;
      googleMountStarted = true;
      void mountGoogleButtons().catch(() => {
        googleMountStarted = false;
      });
      return true;
    };

    if (tryMount()) return;

    if (!document.getElementById("google-gsi-script")) {
      const script = document.createElement("script");
      script.id = "google-gsi-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = tryMount;
      document.head.appendChild(script);
    }

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (tryMount() || attempts > 25) {
        clearInterval(interval);
      }
    }, 200);
  }

  async function mountGoogleButtons() {
    if (!window.google?.accounts?.id) return;

    try {
      const clientId = await resolveGoogleClientId();
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      });

      const gateBtnContainer = document.getElementById("gate-google-btn");
      if (gateBtnContainer) {
        gateBtnContainer.replaceChildren();
        const nativeHost = document.createElement("div");
        nativeHost.hidden = true;
        nativeHost.setAttribute("aria-hidden", "true");
        gateBtnContainer.append(nativeHost);
        window.google.accounts.id.renderButton(nativeHost, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: 280
        });
        const customBtn = document.createElement("button");
        customBtn.type = "button";
        customBtn.className = "tf-google-btn";
        customBtn.innerHTML =
          `<svg class="tf-google-btn__mark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>` +
          `<span>Continuar con Google</span>`;
        customBtn.addEventListener("click", () => {
          const nativeBtn = nativeHost.querySelector("div[role='button'], iframe, button, div");
          if (nativeBtn instanceof HTMLElement) nativeBtn.click();
          else window.google?.accounts?.id?.prompt?.();
        });
        gateBtnContainer.append(customBtn);
      }

      const sidebarBtnContainer = document.getElementById("google-btn-container");
      if (sidebarBtnContainer) {
        sidebarBtnContainer.replaceChildren();
        window.google.accounts.id.renderButton(sidebarBtnContainer, {
          type: "standard",
          theme: "outline",
          size: "medium",
          text: "signin_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: 220
        });
      }
    } catch (err) {
      console.warn("GIS initialization warning:", err);
    }
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
      hideAuthGate();
      renderUserStatus();
      onUserChanged?.(currentUser);
      showToast(`¡Bienvenido, ${currentUser.full_name}!`);
      fetchMessages();
    } catch (err) {
      showToast(`Error de autenticación: ${err.message}`);
    }
  }

  async function handleLogout() {
    try {
      localStorage.removeItem("taskflow_slack_user");
      await fetch("./api/auth/logout", { method: "POST" });
    } catch {}
    currentUser = null;
    renderUserStatus();
    showAuthGate();
    onUserChanged?.(null);
    showToast("Sesión cerrada. Selecciona tu perfil de usuario.");
  }

  // 2. ACTIVE CHANNEL SWITCHING
  function setActiveChannel(channelId, channelName, channelTopic = "") {
    activeChannelId = channelId;
    activeChannelName = channelName;

    if (channelHeading) channelHeading.textContent = `#${channelName}`;
    if (activeChannelTitle) activeChannelTitle.textContent = `#${channelName}`;
    if (activeChannelDesc) {
      activeChannelDesc.textContent = channelTopic || "Canal de discusión y tareas en tiempo real.";
    }

    fetchMessages();
  }

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
        <div class="slack-feed-empty" role="status">
          <p class="slack-feed-empty__title">Canal listo</p>
          <p>Escribe una solicitud en <strong>#${escapeHtml(activeChannelName)}</strong> y TaskFlow la convertirá en tareas priorizadas.</p>
          <p><small>Tip: pega un correo o mensaje de Slack/Teams para empezar.</small></p>
        </div>
      `;
      return;
    }

    messageFeed.innerHTML = messages
      .map((msg) => {
        const isSelf = currentUser && (msg.author_id === currentUser.id || msg.user_id === currentUser.id);
        const authorInitial = (msg.author_name || "U")[0].toUpperCase();
        const avatar = msg.author_avatar
          ? `<div class="slack-avatar-container" style="width:38px!important;height:38px!important;min-width:38px!important;max-width:38px!important;min-height:38px!important;max-height:38px!important;flex-shrink:0!important;border-radius:8px!important;overflow:hidden!important;display:inline-block!important;"><img src="${escapeHtml(msg.author_avatar)}" alt="${escapeHtml(msg.author_name)}" class="slack-avatar-img" width="38" height="38" style="width:38px!important;height:38px!important;min-width:38px!important;max-width:38px!important;min-height:38px!important;max-height:38px!important;object-fit:cover!important;display:block!important;border-radius:8px!important;flex-shrink:0!important;" loading="lazy" /></div>`
          : `<div class="slack-avatar" style="width:38px!important;height:38px!important;min-width:38px!important;max-width:38px!important;flex-shrink:0!important;border-radius:8px!important;display:flex!important;align-items:center!important;justify-content:center!important;">${escapeHtml(authorInitial)}</div>`;

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
          <article class="slack-feed-msg ${isSelf ? "is-self" : ""}" data-msg-id="${escapeHtml(msg.id)}">
            <div class="slack-msg-header" style="display:flex!important;align-items:flex-start!important;gap:0.75rem!important;width:100%!important;">
              ${avatar}
              <div class="slack-msg-meta" style="flex:1 1 auto!important;min-width:0!important;width:calc(100% - 50px)!important;">
                <div class="slack-msg-sender-row">
                  <strong class="slack-sender">${escapeHtml(msg.author_name || "Usuario")}${isSelf ? ' <span class="badge badge--sm">Tú</span>' : ""}</strong>
                  <time class="slack-time">${escapeHtml(timeStr)}</time>
                </div>
                <div class="slack-msg-text" style="word-break:break-word!important;overflow-wrap:break-word!important;width:100%!important;">${escapeHtml(msg.text)}</div>
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
      const activeUser = currentUser || TEAM_PROFILES.usr_valentin;
      const msgId = btn.getAttribute("data-msg-id");
      const emoji = btn.getAttribute("data-emoji");
      if (!msgId || !emoji) return;

      try {
        const res = await fetch("./api/reactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: msgId, emoji, userId: activeUser.id })
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
    const activeUser = currentUser || TEAM_PROFILES.usr_valentin;

    try {
      const res = await fetch("./api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: activeChannelId,
          text,
          userId: activeUser.id
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

  // Fast-path instant restore from localStorage or default
  let storedUser = null;
  try {
    const raw = localStorage.getItem("taskflow_slack_user");
    if (raw) storedUser = JSON.parse(raw);
  } catch {}
  currentUser = storedUser || TEAM_PROFILES.usr_valentin;
  renderUserStatus();
  onUserChanged?.(currentUser);

  // Background non-blocking session check
  checkAuthSession();
  fetchMessages();
  pollIntervalId = setInterval(fetchMessages, 3500);

  return {
    getCurrentUser: () => currentUser,
    getActiveChannel: () => ({ id: activeChannelId, name: activeChannelName }),
    setActiveChannel,
    sendMessage,
    refreshMessages: fetchMessages,
    showAuthGate,
    stopPolling: () => clearInterval(pollIntervalId)
  };
}
