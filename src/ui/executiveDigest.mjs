/**
 * UI PRESENTATION CONTROLLER: EXECUTIVE AI DAILY STANDUP & CONFLICT GUARD
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-020).
 * Zero external npm dependencies. Pure accessible Web Standards.
 */

import { generateDailyExecutiveDigest, resolveScheduleConflicts } from "../domain/workloadOptimizer.mjs";
import { escapeHtml } from "../domain/taskEntities.mjs";

export function initExecutiveDigest({
  getTasks,
  onUpdateTasks,
  showToast,
  getActiveChannel,
  getCurrentUser
}) {
  const openBtn = document.getElementById("btn-daily-digest");
  const dialog = /** @type {HTMLDialogElement|null} */ (document.getElementById("dialog-executive-digest"));
  const bodyEl = document.getElementById("digest-modal-body");
  const copyBtn = document.getElementById("btn-digest-copy");
  const speakBtn = document.getElementById("btn-digest-speak");
  const closeBtn = document.getElementById("btn-digest-close");

  let lastGeneratedDigest = null;
  let synthUtterance = null;

  function renderDigest() {
    if (!dialog || !bodyEl) return;
    const tasks = getTasks() || [];
    const channel = getActiveChannel?.() || { name: "Mi Día" };
    const user = getCurrentUser?.() || { full_name: "Usuario" };

    const digest = generateDailyExecutiveDigest(tasks, {
      activeChannelName: channel.name,
      userName: user.full_name
    });
    lastGeneratedDigest = digest;

    const { metrics, conflicts } = digest;

    let conflictBannerHtml = "";
    if (conflicts.length > 0) {
      conflictBannerHtml = `
        <div class="digest-alert-box" role="alert">
          <div class="digest-alert-icon" aria-hidden="true">⚠️</div>
          <div class="digest-alert-content">
            <strong>Colisión de horario detectada (${conflicts.length})</strong>
            <p>Hay tareas con horarios superpuestos que podrían dificultar tu entrega a tiempo.</p>
            <button type="button" id="btn-resolve-conflicts" class="btn btn-sm btn-warning">
              ⚡ Resolver Colisiones Automáticamente
            </button>
          </div>
        </div>
      `;
    }

    bodyEl.innerHTML = `
      <div class="digest-metrics-row">
        <div class="digest-stat-card">
          <span class="stat-number">${metrics.total}</span>
          <span class="stat-label">Total Tareas</span>
        </div>
        <div class="digest-stat-card">
          <span class="stat-number">${metrics.completed}</span>
          <span class="stat-label">Completadas</span>
        </div>
        <div class="digest-stat-card stat-critical">
          <span class="stat-number">${metrics.critical}</span>
          <span class="stat-label">Prioritarias</span>
        </div>
        <div class="digest-stat-card">
          <span class="stat-number">${metrics.inProgress}</span>
          <span class="stat-label">En Curso</span>
        </div>
      </div>

      ${conflictBannerHtml}

      <div class="digest-markdown-box">
        <label for="digest-raw-text" class="sr-only">Resumen Ejecutivo</label>
        <pre id="digest-raw-text" class="digest-pre">${escapeHtml(digest.markdown)}</pre>
      </div>
    `;

    const resolveBtn = document.getElementById("btn-resolve-conflicts");
    if (resolveBtn) {
      resolveBtn.addEventListener("click", () => {
        const resolved = resolveScheduleConflicts(getTasks() || []);
        onUpdateTasks(resolved);
        showToast("⚡ Horarios escalonados sin colisiones.");
        renderDigest();
      });
    }
  }

  function openModal() {
    if (!dialog) return;
    renderDigest();
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function closeModal() {
    if (!dialog) return;
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  openBtn?.addEventListener("click", openModal);
  closeBtn?.addEventListener("click", closeModal);

  dialog?.addEventListener("click", (e) => {
    if (e.target === dialog) closeModal();
  });

  dialog?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  copyBtn?.addEventListener("click", async () => {
    if (!lastGeneratedDigest?.markdown) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(lastGeneratedDigest.markdown);
        showToast("📋 Resumen copiado en formato Standup (Markdown)");
      } else {
        showToast("Copia no disponible en este entorno.");
      }
    } catch {
      showToast("Error al copiar al portapapeles.");
    }
  });

  speakBtn?.addEventListener("click", () => {
    if (!window.speechSynthesis) {
      showToast("Síntesis de voz no soportada en este navegador.");
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      showToast("Audio pausado.");
      return;
    }

    if (!lastGeneratedDigest?.speechText) return;

    synthUtterance = new SpeechSynthesisUtterance(lastGeneratedDigest.speechText);
    synthUtterance.lang = "es-ES";
    synthUtterance.rate = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find((v) => v.lang.startsWith("es"));
    if (esVoice) synthUtterance.voice = esVoice;

    window.speechSynthesis.speak(synthUtterance);
    showToast("🔊 Reproduciendo resumen ejecutivo...");
  });

  return {
    open: openModal,
    close: closeModal,
    refresh: renderDigest
  };
}
