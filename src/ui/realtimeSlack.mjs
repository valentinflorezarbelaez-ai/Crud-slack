/**
 * REAL-TIME SLACK, FIRST-VISIT GOOGLE AUTH GATE, USER STATUS PERSONALIZATION & CHAT CONTROLLER
 * Connects directly to Neon PostgreSQL serverless endpoints (/api/channels, /api/messages, /api/auth/*).
 * Enforces First-Visit Authentication Gate (FR-CS-013) & Per-User Personalization (FR-CS-015).
 */

import { escapeHtml } from "../domain/taskEntities.mjs";

const GOOGLE_G_SVG =
  `<svg class="tf-google-btn__mark" viewBox="0 0 48 48" aria-hidden="true">` +
  `<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>` +
  `<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>` +
  `<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>` +
  `<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>` +
  `</svg>`;

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

function isPersonalChannel(channelId) {
  const ch = String(channelId || "");
  return ch === "personal" || ch.startsWith("personal-");
}

export function initRealtimeSlack({
  onExtractTasksFromMessage,
  onUserChanged,
  showToast
}) {
  let currentUser = null;
  let activeChannelId = "personal";
  let activeChannelName = "mi-dia";
  let pollIntervalId = null;
  let googleReady = false;

  // DOM Elements
  const authGate = document.getElementById("slack-auth-gate");
  const authCloseBtn = document.getElementById("slack-auth-close-btn");
  const demoDetails = document.getElementById("auth-demo-details");
  const googleStatusTip = document.getElementById("gate-google-status");
  const teamUsersGrid = document.getElementById("team-users-grid");
  const userSlot = document.getElementById("slack-user-slot");
  const channelHeading = document.getElementById("slack-channel-badge");
  const activeChannelTitle = document.getElementById("slack-active-channel-title");
  const activeChannelDesc = document.getElementById("slack-active-channel-desc");
  const messageFeed = document.getElementById("slack-message-feed");

  // 1. AUTHENTICATION & FIRST-VISIT GOOGLE GATEWAY
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

  function renderImmediateGooglePlaceholder(isMissingConfig = false) {
    const gateBtnContainer = document.getElementById("gate-google-btn");
    if (!gateBtnContainer || googleReady) return;
    gateBtnContainer.replaceChildren();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = isMissingConfig ? "tf-google-btn tf-google-btn--pending" : "tf-google-btn";
    btn.innerHTML = `${GOOGLE_G_SVG}<span>Iniciar sesión con Google</span>`;
    btn.addEventListener("click", () => {
      if (isMissingConfig) {
        demoDetails?.scrollIntoView?.({ block: "nearest" });
        showToast("Configura GOOGLE_CLIENT_ID en Vercel para activar Google OAuth en vivo, o elige un perfil rápido abajo.");
      } else {
        void bootstrapGoogleAuth();
      }
    });
    gateBtnContainer.append(btn);
  }

  async function checkAuthSession() {
    try {
      const res = await fetch("./api/auth/me", { credentials: "same-origin" });
      const json = await res.json();
      if (json.ok && json.user) {
        const previousId = currentUser?.id || null;
        currentUser = json.user;
        try {
          localStorage.setItem("taskflow_slack_user", JSON.stringify(currentUser));
        } catch {}
        hideAuthGate();
        setGuestBannerVisible(false);
        renderUserStatus();
        if (previousId !== currentUser.id) {
          onUserChanged?.(currentUser, { restoredFromCookie: true });
        } else {
          onUserChanged?.(currentUser, { refreshedPreferences: true });
        }
      }
    } catch {
      // Offline or unauthenticated: keep current state
    }
  }

  function setGuestBannerVisible(visible) {
    const banner = document.getElementById("guest-mode-banner");
    if (banner) banner.hidden = !visible;
  }

  function showAuthGate() {
    if (authGate) authGate.hidden = false;
    // Guests may dismiss to keep exploring the demo board (Slack-style soft gate).
    if (authCloseBtn) authCloseBtn.hidden = false;
    renderTeamUsersGrid();
    renderImmediateGooglePlaceholder(false);
    void bootstrapGoogleAuth();
  }

  function hideAuthGate() {
    if (authGate) authGate.hidden = true;
  }

  function continueAsGuest() {
    hideAuthGate();
    setGuestBannerVisible(!currentUser);
    showToast("Modo demo: puedes extraer y editar tareas aquí. Entra para guardar en la nube.");
  }

  function loginAsUser(user) {
    if (!user) return;
    currentUser = user;
    try {
      localStorage.setItem("taskflow_slack_user", JSON.stringify(user));
    } catch {}
    hideAuthGate();
    setGuestBannerVisible(false);
    renderUserStatus();
    onUserChanged?.(currentUser, { signedIn: true });
    showToast(`¡Bienvenido, ${currentUser.full_name}! Tu espacio personal está listo.`);
    fetchMessages();

    // Persist session cookie in background and hydrate stored preferences
    fetch("./api/auth/team", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id })
    })
      .then(() => checkAuthSession())
      .catch(() => {});
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

  authCloseBtn?.addEventListener("click", () => continueAsGuest());
  document.getElementById("auth-continue-demo-btn")?.addEventListener("click", () => continueAsGuest());
  document.getElementById("guest-signin-btn")?.addEventListener("click", () => showAuthGate());

  // Neon Managed Better Auth Email + Password Sign-Up / Sign-In wiring
  let emailAuthMode = "signup";
  const emailForm = document.getElementById("neon-email-auth-form");
  const signupTabBtn = document.getElementById("auth-mode-signup-btn");
  const signinTabBtn = document.getElementById("auth-mode-signin-btn");
  const nameFieldWrap = document.getElementById("auth-name-field");
  const nameInput = /** @type {HTMLInputElement|null} */ (document.getElementById("auth-name-input"));
  const emailInput = /** @type {HTMLInputElement|null} */ (document.getElementById("auth-email-input"));
  const passwordInput = /** @type {HTMLInputElement|null} */ (document.getElementById("auth-password-input"));
  const emailSubmitBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById("auth-email-submit-btn"));
  const emailFeedback = document.getElementById("auth-email-feedback");

  function setEmailAuthMode(nextMode) {
    emailAuthMode = nextMode === "signin" ? "signin" : "signup";
    const isSignup = emailAuthMode === "signup";
    signupTabBtn?.classList.toggle("is-active", isSignup);
    signupTabBtn?.setAttribute("aria-selected", String(isSignup));
    signinTabBtn?.classList.toggle("is-active", !isSignup);
    signinTabBtn?.setAttribute("aria-selected", String(!isSignup));
    if (nameFieldWrap) nameFieldWrap.hidden = !isSignup;
    if (passwordInput) passwordInput.autocomplete = isSignup ? "new-password" : "current-password";
    if (emailSubmitBtn) {
      emailSubmitBtn.textContent = isSignup ? "Crear cuenta con correo" : "Entrar con correo";
    }
    if (emailFeedback) {
      emailFeedback.hidden = true;
      emailFeedback.textContent = "";
    }
  }

  signupTabBtn?.addEventListener("click", () => setEmailAuthMode("signup"));
  signinTabBtn?.addEventListener("click", () => setEmailAuthMode("signin"));

  emailForm?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = (emailInput?.value || "").trim();
    const password = passwordInput?.value || "";
    const name = (nameInput?.value || "").trim();

    if (emailFeedback) {
      emailFeedback.hidden = true;
      emailFeedback.classList.remove("is-ok");
    }
    if (!email || password.length < 8) {
      if (emailFeedback) {
        emailFeedback.textContent = "Ingresa un correo válido y contraseña de mínimo 8 caracteres.";
        emailFeedback.hidden = false;
      }
      return;
    }

    if (emailSubmitBtn) {
      emailSubmitBtn.disabled = true;
      emailSubmitBtn.textContent = emailAuthMode === "signup" ? "Creando cuenta..." : "Ingresando...";
    }

    try {
      const res = await fetch("./api/auth/email", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: emailAuthMode, email, password, name })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok || !json.user) {
        throw new Error(json.error || "No se pudo autenticar con correo.");
      }

      currentUser = json.user;
      try {
        localStorage.setItem("taskflow_slack_user", JSON.stringify(currentUser));
      } catch {}
      hideAuthGate();
      setGuestBannerVisible(false);
      renderUserStatus();
      onUserChanged?.(currentUser, { signedIn: true });
      showToast(`¡Bienvenido, ${currentUser.full_name}! Cuenta verificada con Neon Auth.`);
      fetchMessages();
      emailForm.reset();
    } catch (err) {
      if (emailFeedback) {
        emailFeedback.textContent = err.message || "Error al conectar con Neon Auth.";
        emailFeedback.hidden = false;
      }
    } finally {
      if (emailSubmitBtn) {
        emailSubmitBtn.disabled = false;
        emailSubmitBtn.textContent = emailAuthMode === "signup" ? "Crear cuenta con correo" : "Entrar con correo";
      }
    }
  });

  authGate?.addEventListener("click", (ev) => {
    if (ev.target === authGate) continueAsGuest();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && authGate && !authGate.hidden) {
      continueAsGuest();
    }
  });

  async function handleEditCustomStatus() {
    if (!currentUser) return;
    const nextStatus = window.prompt(
      "Personaliza tu frase de estado (se guarda en tu cuenta):",
      currentUser.status_text || "Enfoque profundo"
    );
    if (nextStatus === null) return;
    const trimmed = nextStatus.trim().slice(0, 80) || "En línea";
    currentUser = { ...currentUser, status_text: trimmed };
    try {
      localStorage.setItem("taskflow_slack_user", JSON.stringify(currentUser));
    } catch {}
    renderUserStatus();
    showToast(`Estado actualizado: «${trimmed}»`);

    try {
      await fetch("./api/auth/me", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, statusText: trimmed })
      });
    } catch {
      // Saved locally if offline
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
      <div class="slack-user-profile" title="${escapeHtml(currentUser.email || currentUser.full_name)}">
        <div class="slack-user-avatar-wrap">
          ${avatarHtml}
          <span class="slack-presence-dot" aria-label="En línea"></span>
        </div>
        <div class="slack-user-details">
          <strong class="slack-user-name">${escapeHtml(currentUser.full_name)}</strong>
          <button type="button" id="slack-edit-status-btn" class="slack-user-status slack-user-status--btn" title="Haz clic para personalizar tu estado">
            ✏️ ${escapeHtml(currentUser.status_text || "Personalizar estado")}
          </button>
        </div>
        <button type="button" id="slack-switch-user-btn" class="slack-switch-user-btn" title="Cambiar cuenta">Cuenta</button>
        <button type="button" id="slack-logout-btn" class="btn btn--ghost btn--sm" title="Cerrar sesión">Salir</button>
      </div>
    `;

    document.getElementById("slack-edit-status-btn")?.addEventListener("click", () => {
      void handleEditCustomStatus();
    });
    document.getElementById("slack-switch-user-btn")?.addEventListener("click", () => showAuthGate());
    document.getElementById("slack-logout-btn")?.addEventListener("click", handleLogout);
  }

  function renderGoogleSignInPrompt() {
    if (!userSlot) return;
    userSlot.innerHTML = `
      <div class="google-auth-box">
        <div id="google-btn-container" class="google-btn-slot"></div>
        <button type="button" id="slack-open-gate-btn" class="slack-switch-user-btn slack-open-gate-btn">
          Iniciar sesión / Elegir cuenta
        </button>
      </div>
    `;

    document.getElementById("slack-open-gate-btn")?.addEventListener("click", () => showAuthGate());
  }

  let googleBootPromise = null;
  async function bootstrapGoogleAuth() {
    if (typeof window === "undefined") return;
    if (googleBootPromise) return googleBootPromise;

    googleBootPromise = (async () => {
      let clientId = "";
      try {
        clientId = await resolveGoogleClientId();
      } catch {
        renderImmediateGooglePlaceholder(true);
        if (googleStatusTip) {
          googleStatusTip.textContent =
            "⚙️ Pendiente configurar GOOGLE_CLIENT_ID en Vercel para activar Google OAuth en vivo. Mientras tanto puedes entrar con un perfil de demostración abajo.";
        }
        demoDetails?.scrollIntoView?.({ block: "nearest" });
        googleBootPromise = null;
        return;
      }

      if (googleStatusTip) {
        googleStatusTip.textContent =
          "Cada cuenta tiene su propio espacio, historial, canales, tema visual y listas privadas independientes.";
      }

      await ensureGoogleGsiScript();
      if (!window.google?.accounts?.id) {
        googleBootPromise = null;
        return;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      });

      googleReady = true;

      const gateBtnContainer = document.getElementById("gate-google-btn");
      if (gateBtnContainer) {
        gateBtnContainer.replaceChildren();
        const nativeHost = document.createElement("div");
        nativeHost.className = "gis-native-wrap";
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
    })();

    return googleBootPromise;
  }

  function ensureGoogleGsiScript() {
    if (window.google?.accounts?.id) return Promise.resolve();
    return new Promise((resolve) => {
      let script = /** @type {HTMLScriptElement|null} */ (document.getElementById("google-gsi-script"));
      if (!script) {
        script = document.createElement("script");
        script.id = "google-gsi-script";
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      script.addEventListener("load", done, { once: true });
      script.addEventListener("error", done, { once: true });
      setTimeout(done, 4500);
    });
  }

  async function handleGoogleCredentialResponse(response) {
    if (!response?.credential) return;

    showToast("Verificando tu cuenta de Google...");
    try {
      const res = await fetch("./api/auth/google", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential })
      });

      const json = await res.json();
      if (!res.ok || !json.ok || !json.user) {
        throw new Error(json.error || "No se pudo autenticar con Google.");
      }

      currentUser = {
        id: json.user.id,
        google_id: json.user.google_id,
        email: json.user.email,
        full_name: json.user.full_name || json.user.fullName || json.user.email,
        avatar_url: json.user.avatar_url || json.user.avatarUrl || "",
        status_text: json.user.status_text || json.user.statusText || "Espacio personal activo",
        preferences: json.user.preferences || {}
      };
      try {
        localStorage.setItem("taskflow_slack_user", JSON.stringify(currentUser));
      } catch {}

      hideAuthGate();
      setGuestBannerVisible(false);
      renderUserStatus();
      onUserChanged?.(currentUser, { signedIn: true });
      showToast(`¡Hola, ${currentUser.full_name}! Cargamos tu propio espacio e historial.`);
      fetchMessages();
    } catch (err) {
      showToast(`Error de autenticación: ${err.message}`);
    }
  }

  async function handleLogout() {
    try {
      localStorage.removeItem("taskflow_slack_user");
      await fetch("./api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {}
    currentUser = null;
    googleBootPromise = null;
    googleReady = false;
    if (messageFeed) messageFeed.replaceChildren();
    renderUserStatus();
    onUserChanged?.(null, { loggedOut: true });
    hideAuthGate();
    setGuestBannerVisible(true);
    showToast("Sesión cerrada. Sigues en modo demo; entra de nuevo para guardar en la nube.");
  }

  // 2. ACTIVE CHANNEL SWITCHING
  function setActiveChannel(channelId, channelName, channelTopic = "") {
    activeChannelId = channelId;
    activeChannelName = channelName;

    if (channelHeading) {
      channelHeading.textContent = isPersonalChannel(channelId) ? `🔒 ${channelName}` : `#${channelName}`;
    }
    if (activeChannelTitle) activeChannelTitle.textContent = `#${channelName}`;
    if (activeChannelDesc) {
      activeChannelDesc.textContent = channelTopic || "Canal de discusión y tareas en tiempo real.";
    }

    if (!isPersonalChannel(channelId)) {
      fetchMessages();
    } else if (messageFeed) {
      messageFeed.replaceChildren();
    }
  }

  // 3. MESSAGES FEED & REAL-TIME POLLING
  async function fetchMessages() {
    if (!messageFeed || !currentUser || isPersonalChannel(activeChannelId)) return;
    try {
      const res = await fetch(
        `./api/messages?channelId=${encodeURIComponent(activeChannelId)}`,
        { credentials: "same-origin" }
      );
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
          <p class="slack-feed-empty__title">Historial limpio en #${escapeHtml(activeChannelName)}</p>
          <p>Escribe un mensaje en este canal y TaskFlow organizará sus tareas automáticamente.</p>
          <p><small>Solo tú y quienes invites con «🔗 Invitar» tienen acceso a este canal.</small></p>
        </div>
      `;
      return;
    }

    messageFeed.innerHTML = messages
      .map((msg) => {
        const isSelf = currentUser && (msg.author_id === currentUser.id || msg.user_id === currentUser.id);
        const authorInitial = (msg.author_name || "U")[0].toUpperCase();
        const avatar = msg.author_avatar
          ? `<div class="slack-avatar-container"><img src="${escapeHtml(msg.author_avatar)}" alt="${escapeHtml(msg.author_name)}" class="slack-avatar-img" width="38" height="38" loading="lazy" /></div>`
          : `<div class="slack-avatar slack-avatar--initial">${escapeHtml(authorInitial)}</div>`;

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
            <div class="slack-msg-header slack-msg-header--row">
              ${avatar}
              <div class="slack-msg-meta slack-msg-meta--fluid">
                <div class="slack-msg-sender-row">
                  <strong class="slack-sender">${escapeHtml(msg.author_name || "Usuario")}${isSelf ? ' <span class="badge badge--sm">Tú</span>' : ""}</strong>
                  <time class="slack-time">${escapeHtml(timeStr)}</time>
                </div>
                <div class="slack-msg-text slack-msg-text--wrap">${escapeHtml(msg.text)}</div>
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
        showAuthGate();
        return;
      }
      const msgId = btn.getAttribute("data-msg-id");
      const emoji = btn.getAttribute("data-emoji");
      if (!msgId || !emoji) return;

      try {
        const res = await fetch("./api/reactions", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: msgId, emoji, userId: currentUser.id })
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

  // Sending Real Message from Slack Composer (collaborative channels only)
  async function sendMessage(text) {
    if (isPersonalChannel(activeChannelId)) return true;
    if (!currentUser) {
      showAuthGate();
      return false;
    }

    try {
      const res = await fetch("./api/messages", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: activeChannelId,
          text,
          userId: currentUser.id
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

  // First-Visit Auth Gate Enforcement (FR-CS-013):
  let storedUser = null;
  try {
    const raw = localStorage.getItem("taskflow_slack_user");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.id === "string" && parsed.id.length > 0) {
        storedUser = parsed;
      }
    }
  } catch {}

  if (storedUser) {
    currentUser = storedUser;
    hideAuthGate();
    setGuestBannerVisible(false);
    renderUserStatus();
    onUserChanged?.(currentUser, { initial: true });
  } else {
    currentUser = null;
    hideAuthGate();
    setGuestBannerVisible(true);
    renderUserStatus();
    onUserChanged?.(null, { initial: true });
  }

  // Verify server HttpOnly cookie session in background
  void checkAuthSession();
  fetchMessages();

  const pollSlackMessages = () => {
    if (typeof document !== "undefined" && document.hidden) return;
    fetchMessages();
  };
  pollIntervalId = setInterval(pollSlackMessages, 3500);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) fetchMessages();
    });
  }

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
