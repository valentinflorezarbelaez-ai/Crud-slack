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

export function getInitialRoleTasks(userId, refDateIso) {
  const roleMap = {
    usr_valentin: [
      {
        id: "t-valentin-1",
        title: "Consolidar entregables del equipo para la reunión del viernes",
        priority: "CRITICAL",
        status: "PENDING",
        deadlineDate: refDateIso,
        deadlineState: "CONFIRMED",
        assignee: "Valentín Flórez Arbelaez",
        sourceQuote: "reunión del equipo para el viernes",
        priorityReason: "Coordinación general de compromisos del equipo."
      },
      {
        id: "t-valentin-2",
        title: "Revisar informe de resultados mensuales y métricas operativas",
        priority: "HIGH",
        status: "IN_PROGRESS",
        deadlineDate: null,
        deadlineState: "MISSING",
        assignee: "Valentín Flórez Arbelaez",
        sourceQuote: "revisar los resultados del mes",
        priorityReason: "Reporte de avance para la dirección."
      },
      {
        id: "t-valentin-3",
        title: "Enviar agenda y objetivos de trabajo a todos los participantes",
        priority: "MEDIUM",
        status: "PENDING",
        deadlineDate: refDateIso,
        deadlineState: "CONFIRMED",
        assignee: "Valentín Flórez Arbelaez",
        sourceQuote: "enviar la agenda a los participantes",
        priorityReason: "Alineación de participantes antes de la sesión."
      }
    ],
    usr_ana: [
      {
        id: "t-ana-1",
        title: "Diseñar componentes del sistema de diseño para Slack Lists",
        priority: "HIGH",
        status: "IN_PROGRESS",
        deadlineDate: refDateIso,
        deadlineState: "CONFIRMED",
        assignee: "Jacobo Flórez Galeano",
        sourceQuote: "sistema de diseño y componentes UX",
        priorityReason: "Consistencia visual y tokens de accesibilidad."
      },
      {
        id: "t-ana-2",
        title: "Auditoría de contraste y legibilidad tipográfica WCAG 2.1 AA",
        priority: "CRITICAL",
        status: "PENDING",
        deadlineDate: null,
        deadlineState: "MISSING",
        assignee: "Jacobo Flórez Galeano",
        sourceQuote: "auditoría de accesibilidad visual",
        priorityReason: "Cumplimiento normativo y ergonomía visual."
      },
      {
        id: "t-ana-3",
        title: "Preparar especificación de micro-interacciones y estados hover",
        priority: "MEDIUM",
        status: "COMPLETED",
        deadlineDate: refDateIso,
        deadlineState: "CONFIRMED",
        assignee: "Jacobo Flórez Galeano",
        sourceQuote: "estados interactivos",
        priorityReason: "Claridad en feedback táctil y teclado."
      }
    ],
    usr_carlos: [
      {
        id: "t-carlos-1",
        title: "Optimizar pool de conexiones y latencia en Neon PostgreSQL",
        priority: "CRITICAL",
        status: "IN_PROGRESS",
        deadlineDate: refDateIso,
        deadlineState: "CONFIRMED",
        assignee: "Edison Flórez López",
        sourceQuote: "conexiones PostgreSQL serverless",
        priorityReason: "Estabilidad de persistencia en tiempo real."
      },
      {
        id: "t-carlos-2",
        title: "Implementar validación estricta de payloads y firma HMAC",
        priority: "HIGH",
        status: "COMPLETED",
        deadlineDate: refDateIso,
        deadlineState: "CONFIRMED",
        assignee: "Edison Flórez López",
        sourceQuote: "seguridad de sesiones y cookies",
        priorityReason: "Protección contra inyección y manipulación de tokens."
      },
      {
        id: "t-carlos-3",
        title: "Monitorear endpoints de mensajería y eventos en tiempo real",
        priority: "MEDIUM",
        status: "PENDING",
        deadlineDate: null,
        deadlineState: "MISSING",
        assignee: "Edison Flórez López",
        sourceQuote: "observabilidad de endpoints",
        priorityReason: "Diagnóstico proactivo de latencia."
      }
    ],
    usr_elena: [
      {
        id: "t-elena-1",
        title: "Ejecutar suite de pruebas de regresión y cobertura BDD",
        priority: "CRITICAL",
        status: "IN_PROGRESS",
        deadlineDate: refDateIso,
        deadlineState: "CONFIRMED",
        assignee: "Roberto Urrea",
        sourceQuote: "suite de pruebas automatizadas",
        priorityReason: "Garantía de calidad 7-gate SecDevOps."
      },
      {
        id: "t-elena-2",
        title: "Verificar aislamiento de almacenamiento por usuario en localStorage",
        priority: "HIGH",
        status: "COMPLETED",
        deadlineDate: refDateIso,
        deadlineState: "CONFIRMED",
        assignee: "Roberto Urrea",
        sourceQuote: "aislamiento de estado multi-usuario",
        priorityReason: "Verificación de independencia de historiales."
      },
      {
        id: "t-elena-3",
        title: "Validar flujo de creación y eliminación de canales en vivo",
        priority: "MEDIUM",
        status: "PENDING",
        deadlineDate: null,
        deadlineState: "MISSING",
        assignee: "Roberto Urrea",
        sourceQuote: "pruebas de canales dinámicos",
        priorityReason: "Comprobación de sincronización con base de datos."
      }
    ]
  };

  return roleMap[userId] || roleMap.usr_valentin;
}
