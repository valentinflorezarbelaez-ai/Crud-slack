/**
 * WORKPLACE SCENARIO PRESETS FOR LIVE EVALUATION
 * Preset #1 is the exact canonical challenge prompt provided by Luis Soto.
 */

export const WORKPLACE_PRESETS = Object.freeze([
  {
    id: "reto-oficial-viernes",
    label: "Caso Oficial del Reto (Reunión Viernes)",
    channel: "email",
    sender: "Coordinación de Equipo · Correo Interno",
    message:
      "Hola, necesitamos preparar la reunión del equipo para el viernes. Hay que revisar los resultados del mes, actualizar la presentación y enviar la agenda a los participantes antes de la reunión."
  },
  {
    id: "sharepoint-intranet",
    label: "Solicitud SharePoint & Permisos",
    channel: "teams",
    sender: "Líder de Área · Microsoft Teams",
    message:
      "Hola equipo, necesitamos auditar los permisos del sitio de SharePoint de Operaciones, crear la lista de control de entregables para mañana, migrar las plantillas aprobadas y publicar el comunicado al equipo antes de la reunión del jueves."
  },
  {
    id: "incidente-slack-prod",
    label: "Incidente Urgente en Slack",
    channel: "slack",
    sender: "#ops-alertas · Slack",
    message:
      "Equipo, urgente: hay que corregir el error crítico de validación en el formulario de registro hoy, verificar los logs de producción asignado a Carlos, actualizar el reporte de estado y notificar a soporte cuando quede desplegado."
  },
  {
    id: "sin-fechas-antihalucinacion",
    label: "Prueba Anti-Alucinación (0 Fechas)",
    channel: "whatsapp",
    sender: "Chat Directo · Sin Fechas",
    message:
      "Buenos días, por favor revisar el contrato del nuevo proveedor, validar las cláusulas de confidencialidad con legal y compartir los comentarios con compras."
  }
]);
