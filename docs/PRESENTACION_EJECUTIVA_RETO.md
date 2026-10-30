# Informe Ejecutivo & Guía de Sustentación — Reto Práctico Final: Organiza Tareas con IA

**Autor:** Valentín Flórez Arbeláez  
**Evaluador:** Luis Soto (Desarrollador Software Plataforma SharePoint)

---

## 1. La solución propuesta: ¿Qué construimos y qué problema resuelve?
Construimos **TaskFlow AI**, una solución web interactiva y omnicanal que recibe solicitudes cotidianas de trabajo provenientes de **correo electrónico, Slack, Microsoft Teams o WhatsApp** y las transforma automáticamente en un plan de tareas estructurado, priorizado por orden lógico de ejecución y completamente editable (**CRUD: Crear, Leer, Actualizar y Eliminar**).

- **Problema que resuelve:** En el trabajo diario las solicitudes llegan mezcladas en párrafos informales; se olvidan subtareas, no queda claro por cuál empezar y se asumen fechas que nadie confirmó.
- **Valor diferencial (Guardia Anti-Alucinación):** En lugar de inventar fechas límite cuando el mensaje no las trae, el sistema clasifica cada fecha en **Confirmada**, **Referencia Parcial** (ej. *"para el viernes"* o *"antes de la reunión"* sin hora exacta) o **Información Faltante**, y redacta automáticamente un mensaje breve para pedir al remitente únicamente los datos ausentes.

---

## 2. Las herramientas utilizadas: ¿Cuáles elegimos y por qué?
1. **Google Gemini 3.8 Flash (`/v1beta/interactions` con JSON Schema estricto):** Elegido por su rapidez, precisión semántica en español y capacidad de devolver estructuras JSON tipadas.
2. **Verificador Determinista & Motor Neuro-Simbólico Layer-0 (JavaScript/ESM puro, 0 dependencias externas):** Audita cada tarea devuelta por la IA contra el texto original para impedir fechas o responsables inventados, y funciona como respaldo instantáneo (*Circuit Breaker* `< 2 ms`) si no hay conexión o cuota de API.
3. **Vercel Fluid Compute (Node.js 24 LTS):** Mantiene las credenciales seguras del lado del servidor (`/api/analyze`) y publica la solución con HTTPS y cabeceras de seguridad OWASP.
4. **Interoperabilidad Empresarial (CSV para SharePoint Lists / Planner y Markdown para Slack / Teams):** Permite llevar la lista organizada directamente a las herramientas reales del equipo con un clic.

---

## 3. El funcionamiento: Ejemplo sobre el caso oficial del reto

**Entrada:**
> *"Hola, necesitamos preparar la reunión del equipo para el viernes. Hay que revisar los resultados del mes, actualizar la presentación y enviar la agenda a los participantes antes de la reunión."*

**Resultado generado y verificado:**
1. **#1 Revisar los resultados del mes** — Prioridad **Alta (P1)** *(Insumo base bloqueante antes de actualizar la presentación)* · Fecha: **Información faltante** *(previo al viernes, sin día/hora propia especificada)*.
2. **#2 Actualizar la presentación** — Prioridad **Alta (P1)** *(Entregable clave dependiente de #1)* · Fecha: **Información faltante** *(previo al viernes, sin fecha/hora exacta)*.
3. **#3 Enviar la agenda a los participantes** — Prioridad **Alta (P1)** *(Restricción explícita «antes de la reunión»)* · Fecha: **Referencia parcial** *(antes del viernes, falta definir cuántas horas/días antes y lista de participantes)*.
4. **#4 Preparar la reunión del equipo** — Prioridad **Media (P2)** *(Hito objetivo que consolida #1, #2 y #3)* · Fecha: **Viernes (Fecha ancla resuelta · hora y sala por confirmar)**.

---

## 4. Las dificultades encontradas y cómo las resolvimos
- **Alucinación de fechas en modelos generativos:** Los LLMs tienden a completar campos vacíos inventando fechas intermedias. Lo resolvimos combinando instrucciones estrictas con un **verificador determinista post-IA** (`groundingVerifier.mjs`) que revoca cualquier fecha sin respaldo léxico en el mensaje original.
- **Priorización sin palabras explícitas de urgencia:** Mensajes cotidianos rara vez dicen *"prioridad P1"*. Modelamos la precedencia funcional (insumo diagnóstico ➔ construcción de entregable ➔ distribución previa ➔ evento/reunión) para sugerir prioridades justificadas.
- **Seguridad al exportar texto libre a CSV/Excel/SharePoint:** Neutralizamos inyección de fórmulas (`=`, `+`, `-`, `@`) y XSS para que cualquier mensaje externo se procese de forma segura.

---

## 5. Arquitectura de Integración Microsoft 365 & SharePoint (Suite Especializada)
Para el ecosistema corporativo de Microsoft, entregamos tres artefactos de nivel Big Tech:
1. **Script de Aprovisionamiento PnP.PowerShell (`docs/sharepoint/Provision-TaskFlowSharePointList.ps1`):** Aprovisiona la lista personalizada `TaskFlow_Actividades` en SharePoint Online con control de versiones, tipos de columna estrictos (`Prioridad`, `EstadoTarea`, `FechaLimite`, `EstadoFecha`, `DetalleFaltante`, `Responsable`, `CitaTextualFuente`) y vistas filtradas para tareas con información pendiente.
2. **Plantilla de Microsoft Teams Adaptive Card v1.5 (`exportToTeamsAdaptiveCard`):** Genera payloads oficiales JSON de Adaptive Cards con facts estructurados, semáforo de prioridades y botones interactivos para abrir la aplicación o ver la lista de SharePoint.
3. **Plano de Flujo de Power Automate (`docs/sharepoint/power-automate-flow-blueprint.json`):** Automatiza la ingesta: *Nuevo correo en Outlook o mensaje en Teams* ➔ *Llamada HTTP a /api/analyze* ➔ *Crear ítems en SharePoint List* ➔ *Notificar en canal de Teams con Adaptive Card* ➔ *Responder al correo con el borrador de aclaración si faltan fechas*.

---

## 6. Oportunidades de mejora (Roadmap)
1. **Conector empaquetado como SharePoint Framework (SPFx) Web Part:** Incrustar el panel de triaje de TaskFlow AI directamente dentro de las páginas de SharePoint y Teams.
2. **Bot interactivo en Slack y Teams con Webhooks firmados (HMAC):** Reaccionar con un emoji (⚡) a cualquier mensaje del canal para generar y asignar las tareas dentro del mismo hilo.
3. **Autenticación SSO (Microsoft Entra ID) y tableros multiusuario en tiempo real.**

---

## 7. Guía rápida para las 5 preguntas de conversación
- **¿Por qué elegiste esta idea y estas herramientas?** Porque une la comprensión natural de la IA generativa con la confiabilidad determinista y permite actuar de inmediato (editar fechas faltantes y exportar a SharePoint o Slack) sin fricción.
- **¿Qué fue lo más difícil y cómo lo resolviste?** Evitar que la IA inventara fechas intermedias cuando solo existe una fecha ancla general (*"el viernes"*); lo resolví separando estados temporales (`CONFIRMED`, `PARTIAL_ANCHOR`, `MISSING_INFO`) y auditando el texto fuente.
- **¿Cómo comprobarías que las tareas identificadas por la IA son correctas?** Mediante (1) verificación algorítmica de cita textual (`sourceQuote`), (2) guardia determinista anti-alucinación de fechas/responsables, (3) métricas de cobertura de cláusulas visibles en pantalla y (4) suite automatizada de pruebas BDD (`npm test`).
- **¿Qué mejorarías si tuvieras una hora adicional?** Agregaría integración directa por Webhook hacia un flujo de **Power Automate / SharePoint Lists** o **Slack Incoming Webhook** para publicar la tabla aprobada en el canal del equipo con un clic.
- **¿Cómo convertirías esta demostración en una solución que otras personas pudieran utilizar?** Añadiendo inicio de sesión corporativo (SSO Entra ID), base de datos compartida por equipo/proyecto y extensión nativa dentro de Teams, Slack y Outlook.
