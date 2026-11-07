/**
 * UI CONTROLLER: PERSISTENT TASK-LEVEL DISCUSSION THREADS (💬 Hilo)
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-018, BDD-CS-010).
 *
 * Connects #slack-thread-dialog on every task card to Neon PostgreSQL task_comments
 * via /api/messages?taskId=<id>, isolating private space notes per user and syncing
 * collaborative channel task discussions in real time.
 * Zero inline style mutations (Strict CSP) & strict escapeHtml() sanitization.
 */

import {
  DEADLINE_STATES,
  PRIORITIES,
  TASK_STATUSES,
  escapeHtml
} from "../domain/taskEntities.mjs";

function formatShortTime(isoStr) {
  if (!isoStr) return "ahora";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "ahora";
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getInitials(name) {
  return (
    String(name || "U")
      .trim()
      .split(/\s+/)
      .map((w) => w[0] || "")
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"
  );
}

/**
 * Initializes the persistent task discussion thread controller.
 * @param {{
 *   getActiveChannel: () => { id: string, kind: string, name: string, label?: string },
 *   getCurrentUser: () => { id: string, full_name?: string, avatar_url?: string } | null,
 *   getFallbackQuote: () => string,
 *   showAuthGate?: () => void,
 *   showToast: (msg: string) => void
 * }} deps
 */
export function initTaskThreads({
  getActiveChannel,
  getCurrentUser,
  getFallbackQuote,
  showAuthGate,
  showToast
}) {
  const dialog = /** @type {HTMLDialogElement|null} */ (document.getElementById("slack-thread-dialog"));
  const channelEl = document.getElementById("slack-thread-channel-name");
  const avatarEl = document.getElementById("slack-thread-avatar");
  const senderEl = document.getElementById("slack-thread-sender");
  const quoteEl = document.getElementById("slack-thread-parent-quote");
  const detailsEl = document.getElementById("slack-thread-task-details");
  const commentsListEl = document.getElementById("slack-thread-comments-list");
  const replyInput = /** @type {HTMLInputElement|null} */ (document.getElementById("slack-thread-quick-reply"));
  const sendBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById("slack-thread-send-reply-btn"));
  const closeBtn = document.getElementById("close-thread-dialog-btn");
  const dismissBtn = document.getElementById("dismiss-thread-dialog-btn");

  /** @type {any|null} */
  let currentTask = null;
  let sending = false;

  function renderComments(comments) {
    if (!commentsListEl) return;
    if (!Array.isArray(comments) || comments.length === 0) {
      commentsListEl.innerHTML =
        `<p class="slack-thread-comments__empty">Aún no hay comentarios en esta tarea. Escribe el primero abajo para dejar acuerdos o avances registrados.</p>`;
      return;
    }

    commentsListEl.innerHTML = comments
      .map((c) => {
        const author = c.author_name || "Colaborador";
        const avatarHtml = c.author_avatar
          ? `<img src="${escapeHtml(c.author_avatar)}" alt="" class="slack-thread-comment__avatar-img" width="28" height="28" decoding="async" />`
          : `<span class="slack-thread-comment__avatar-txt">${escapeHtml(getInitials(author))}</span>`;
        return `
          <div class="slack-thread-comment-item">
            <div class="slack-thread-comment__avatar">${avatarHtml}</div>
            <div class="slack-thread-comment__body">
              <div class="slack-thread-comment__meta">
                <strong>${escapeHtml(author)}</strong>
                <time>${escapeHtml(formatShortTime(c.created_at))}</time>
              </div>
              <p class="slack-thread-comment__text">${escapeHtml(c.text || "")}</p>
            </div>
          </div>
        `;
      })
      .join("");
    commentsListEl.scrollTop = commentsListEl.scrollHeight;
  }

  async function loadCommentsForTask(task) {
    if (!commentsListEl || !task) return;
    const channel = getActiveChannel();
    const user = getCurrentUser();

    if (channel.kind === "personal" && !user?.id) {
      renderComments([]);
      return;
    }

    commentsListEl.innerHTML = `<p class="slack-thread-comments__empty">Cargando comentarios guardados...</p>`;
    try {
      const params = new URLSearchParams({
        taskId: task.id,
        channelId: channel.id
      });
      if (user?.id) params.set("userId", user.id);

      const res = await fetch(`./api/messages?${params.toString()}`, {
        method: "GET",
        credentials: "same-origin"
      });
      const json = await res.json().catch(() => null);
      if (currentTask?.id !== task.id) return;
      if (res.ok && json?.ok && Array.isArray(json.comments)) {
        renderComments(json.comments);
      } else {
        renderComments([]);
      }
    } catch {
      if (currentTask?.id === task.id) renderComments([]);
    }
  }

  async function submitComment() {
    if (sending || !currentTask || !replyInput) return;
    const text = replyInput.value.trim();
    if (!text) return;

    const user = getCurrentUser();
    if (!user?.id) {
      showToast("Inicia sesión para comentar y guardar acuerdos en el hilo.");
      dialog?.close();
      showAuthGate?.();
      return;
    }

    const channel = getActiveChannel();
    sending = true;
    if (sendBtn) sendBtn.disabled = true;

    try {
      const res = await fetch("./api/messages", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: currentTask.id,
          channelId: channel.id,
          text,
          userId: user.id
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "No se pudo guardar el comentario.");
      }

      replyInput.value = "";
      showToast("💬 Comentario guardado en el hilo de la tarea.");
      await loadCommentsForTask(currentTask);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error de red al guardar comentario.");
    } finally {
      sending = false;
      if (sendBtn) sendBtn.disabled = false;
      replyInput.focus();
    }
  }

  function openThreadDialog(task) {
    if (!dialog || !task) return;
    currentTask = task;
    const channel = getActiveChannel();
    const user = getCurrentUser();

    const channelVal = channel.kind === "personal" ? channel.name || "mi-dia" : channel.name || "general";
    if (channelEl) channelEl.textContent = channelVal;
    if (avatarEl) {
      avatarEl.textContent = channel.kind === "personal" ? getInitials(user?.full_name || "Privado") : "TF";
    }
    if (senderEl) {
      senderEl.textContent =
        channel.kind === "personal"
          ? `${user?.full_name || "Tu Espacio"} (${channel.label || "Privado"})`
          : `Canal #${channelVal}`;
    }
    if (quoteEl) {
      quoteEl.textContent = `"${task.sourceQuote || getFallbackQuote() || task.title}"`;
    }

    const prioMeta = PRIORITIES[task.priority] || PRIORITIES.MEDIUM;
    const statusMeta = TASK_STATUSES[task.status] || TASK_STATUSES.PENDING;
    const isConfirmed = task.deadlineState === DEADLINE_STATES.CONFIRMED;

    if (detailsEl) {
      detailsEl.innerHTML = `
        <div class="slack-msg-sender-row">
          <strong>#${escapeHtml(task.order)} ${escapeHtml(task.title)}</strong>
          <span class="prio-badge ${escapeHtml(prioMeta.badgeClass)}">${escapeHtml(prioMeta.labelEs)}</span>
          <span class="meta-badge">${escapeHtml(statusMeta.labelEs)}</span>
        </div>
        <p class="task-card__reason">${escapeHtml(task.priorityReason)}</p>
        ${task.sourceQuote ? `<p class="task-card__quote">💬 Sustento textual: "${escapeHtml(task.sourceQuote)}"</p>` : ""}
        <div class="task-badges">
          ${task.scheduledTime ? `<span class="meta-badge">⏰ Hora: ${escapeHtml(task.scheduledTime)}</span>` : ""}
          <span class="date-badge ${isConfirmed ? "date-confirmed" : "date-missing"}">
            ${isConfirmed ? "📅 Fecha:" : "⚠️ Falta fecha:"} ${escapeHtml(task.deadlineLabel)}
          </span>
          <span class="meta-badge">👤 Asignado: ${escapeHtml(task.assignee)}</span>
        </div>
        ${!isConfirmed ? `<p class="task-card__missing">Alerta Anti-Alucinación: ${escapeHtml(task.missingDetails || "Fecha no especificada en el mensaje original.")}</p>` : ""}
      `;
    }

    dialog.showModal();
    void loadCommentsForTask(task);
  }

  closeBtn?.addEventListener("click", () => dialog?.close());
  dismissBtn?.addEventListener("click", () => dialog?.close());
  sendBtn?.addEventListener("click", () => void submitComment());
  replyInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      void submitComment();
    }
  });

  return {
    openThreadDialog
  };
}
