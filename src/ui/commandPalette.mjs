/**
 * COMMAND PALETTE CONTROLLER (Ctrl + K / Cmd + K)
 * Big Tech style spotlight for instant keyboard-driven search & action execution.
 */

export function setupCommandPalette({
  dialog,
  searchInput,
  resultsList,
  getTasks,
  onSelectAction,
  openCrudDialog,
  setViewMode,
  showToast
}) {
  if (!dialog || !searchInput || !resultsList) return;

  const defaultCommands = [
    { id: "daily-digest", label: "?? Resumen Diario Ejecutivo (AI Standup)", category: "Acci?n", icon: "??" },
    { id: "new-task", label: "+ Crear Nueva Tarea", category: "Acción", icon: "➕" },
    { id: "view-cards", label: "Vista Slack Lists", category: "Navegación", icon: "📋" },
    { id: "view-kanban", label: "Vista Tablero Kanban", category: "Navegación", icon: "📌" },
    { id: "view-table", label: "Vista Tabla Ejecutiva", category: "Navegación", icon: "📊" },
    { id: "view-sharepoint", label: "Vista SharePoint Modern", category: "Navegación", icon: "📑" },
    { id: "export-ics", label: "Agendar en Outlook / iCal (.ics)", category: "Exportar", icon: "📅" },
    { id: "export-csv", label: "Exportar CSV para SharePoint Lists", category: "Exportar", icon: "📤" },
    { id: "export-slack", label: "Copiar Resumen para Slack / Teams", category: "Exportar", icon: "💬" },
    { id: "export-teams", label: "Ver Adaptive Card de Teams", category: "Exportar", icon: "🚀" }
  ];

  function renderResults(query = "") {
    const q = query.trim().toLowerCase();
    const tasks = getTasks() || [];
    const matchedTasks = tasks
      .filter((t) => !q || t.title.toLowerCase().includes(q) || (t.assignee && t.assignee.toLowerCase().includes(q)))
      .slice(0, 5)
      .map((t) => ({
        id: `task:${t.id}`,
        label: `#${t.order} ${t.title} (${t.priority})`,
        category: "Tarea",
        icon: t.status === "COMPLETED" ? "✅" : "⏳",
        taskId: t.id
      }));

    const matchedCommands = defaultCommands.filter(
      (c) => !q || c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
    );

    const all = [...matchedCommands, ...matchedTasks];
    if (all.length === 0) {
      resultsList.innerHTML = `<li class="cmd-palette-empty">No se encontraron comandos ni tareas para "${query}".</li>`;
      return;
    }

    resultsList.innerHTML = all
      .map(
        (item, idx) => `
        <li class="cmd-palette-item ${idx === 0 ? "is-selected" : ""}" data-cmd-id="${item.id}" role="option">
          <span class="cmd-palette-item__icon">${item.icon}</span>
          <span class="cmd-palette-item__label">${item.label}</span>
          <span class="cmd-palette-item__cat">${item.category}</span>
        </li>
      `
      )
      .join("");
  }

  function executeItem(cmdId) {
    dialog.close();
    if (!cmdId) return;

    if (cmdId.startsWith("task:")) {
      const taskId = cmdId.replace("task:", "");
      const task = getTasks().find((t) => t.id === taskId);
      if (task) openCrudDialog(task);
      return;
    }

    switch (cmdId) {
      case "daily-digest":
        document.getElementById("btn-daily-digest")?.click();
        break;
      case "new-task":
        openCrudDialog(null);
        break;
      case "view-cards":
        setViewMode("cards");
        break;
      case "view-kanban":
        setViewMode("kanban");
        break;
      case "view-table":
        setViewMode("table");
        break;
      case "view-sharepoint":
        setViewMode("sharepoint");
        break;
      default:
        if (typeof onSelectAction === "function") {
          onSelectAction(cmdId);
        }
    }
  }

  searchInput.addEventListener("input", () => {
    renderResults(searchInput.value);
  });

  resultsList.addEventListener("click", (ev) => {
    const item = /** @type {HTMLElement} */ (ev.target)?.closest(".cmd-palette-item");
    if (!item) return;
    const cmdId = item.getAttribute("data-cmd-id");
    executeItem(cmdId);
  });

  // Keyboard navigation inside palette
  searchInput.addEventListener("keydown", (ev) => {
    const items = Array.from(resultsList.querySelectorAll(".cmd-palette-item"));
    if (items.length === 0) return;
    const currentIdx = items.findIndex((el) => el.classList.contains("is-selected"));

    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      const nextIdx = (currentIdx + 1) % items.length;
      items.forEach((el, idx) => el.classList.toggle("is-selected", idx === nextIdx));
      items[nextIdx].scrollIntoView({ block: "nearest" });
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      const prevIdx = (currentIdx - 1 + items.length) % items.length;
      items.forEach((el, idx) => el.classList.toggle("is-selected", idx === prevIdx));
      items[prevIdx].scrollIntoView({ block: "nearest" });
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      const selected = items[currentIdx >= 0 ? currentIdx : 0];
      if (selected) {
        executeItem(selected.getAttribute("data-cmd-id"));
      }
    }
  });

  return {
    open() {
      searchInput.value = "";
      renderResults("");
      dialog.showModal();
      setTimeout(() => searchInput.focus(), 50);
    },
    close() {
      dialog.close();
    }
  };
}
