/**
 * KANBAN HTML5 DRAG & DROP CONTROLLER
 * Zero external libraries. Fully native drag & drop with accessibility announcements.
 */

import { playCardDroppedSound } from "./soundFx.mjs";

export function setupKanbanDragAndDrop(tasksRoot, onStatusDrop) {
  if (!tasksRoot) return;

  tasksRoot.addEventListener("dragstart", (ev) => {
    const card = /** @type {HTMLElement} */ (ev.target)?.closest(".task-card");
    if (!card) return;
    const taskId = card.getAttribute("data-id");
    if (!taskId) return;

    card.classList.add("is-dragging");
    if (ev.dataTransfer) {
      ev.dataTransfer.setData("text/plain", taskId);
      ev.dataTransfer.effectAllowed = "move";
    }
  });

  tasksRoot.addEventListener("dragend", (ev) => {
    const card = /** @type {HTMLElement} */ (ev.target)?.closest(".task-card");
    if (card) card.classList.remove("is-dragging");
    document.querySelectorAll(".kanban-col.drag-over").forEach((c) => c.classList.remove("drag-over"));
  });

  tasksRoot.addEventListener("dragover", (ev) => {
    const col = /** @type {HTMLElement} */ (ev.target)?.closest(".kanban-col");
    if (!col) return;
    ev.preventDefault();
    if (ev.dataTransfer) {
      ev.dataTransfer.dropEffect = "move";
    }
    col.classList.add("drag-over");
  });

  tasksRoot.addEventListener("dragleave", (ev) => {
    const col = /** @type {HTMLElement} */ (ev.target)?.closest(".kanban-col");
    if (col && !col.contains(/** @type {Node} */ (ev.relatedTarget))) {
      col.classList.remove("drag-over");
    }
  });

  tasksRoot.addEventListener("drop", (ev) => {
    const col = /** @type {HTMLElement} */ (ev.target)?.closest(".kanban-col");
    if (!col) return;
    ev.preventDefault();
    col.classList.remove("drag-over");

    const targetStatus = col.getAttribute("data-col-status");
    const taskId = ev.dataTransfer?.getData("text/plain");

    if (taskId && targetStatus && typeof onStatusDrop === "function") {
      playCardDroppedSound();
      onStatusDrop(taskId, targetStatus);
    }
  });
}
