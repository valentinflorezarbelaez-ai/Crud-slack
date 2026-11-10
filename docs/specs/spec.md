# SPEC-CRUD-SLACK-001: OMNICHANNEL AI TASK TRIAGE & CRUD WORKSPACE

## 1. Specification Metadata
- **Spec ID**: `SPEC-CRUD-SLACK-001`
- **Project**: `crud-slack` (`TaskFlow AI`)
- **Status**: `SPECIFICATION_APPROVED`
- **Standard**: IEEE 830 / ISO 29148, EOS Formal EARS & BDD Doctrine
- **Date**: `2026-11-06`
- **Owner Approval**: Valentín Flórez Arbeláez (Principal Architect)

---

## 2. Functional Requirements (Formal EARS Syntax)

### FR-CS-001: Unstructured Omnichannel Activity Extraction
- **Pattern (Event-Driven)**: CUANDO el usuario envía una solicitud de texto libre proveniente de correo o chat (Slack, Microsoft Teams, Correo/Outlook o WhatsApp) con longitud válida (`1..4000` caracteres), EL SISTEMA identificará y extraerá cada actividad accionable como una entidad de tarea independiente, ordenada lógicamente y vinculada a su cita textual exacta (`sourceQuote`) del mensaje original.

### FR-CS-002: Contextual & Dependency-Aware Priority Suggestion
- **Pattern (Event-Driven)**: CUANDO una actividad es identificada por el motor de análisis, EL SISTEMA sugerirá un nivel de prioridad determinista (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) acompañado de una justificación explícita basada en urgencia temporal, palabras clave de impacto y dependencias veterinarias/previas frente a otras tareas del mismo mensaje.

### FR-CS-003: Anti-Hallucination Temporal Resolution & Missing Information Detection
- **Pattern (Error / Unwanted Condition)**: SI una actividad carece de fecha límite explícita, hora exacta, responsable asignado o datos logísticos necesarios en el mensaje fuente, ENTONCES EL SISTEMA prohibirá inventar o inferir fechas inexistentes, clasificará el campo con estado `MISSING_INFO` o `PARTIAL_ANCHOR` y registrará una alerta específica en el panel de información faltante junto con un borrador automático de solicitud de aclaración.

### FR-CS-004: Grounding & Anti-Hallucination Neuro-Symbolic Verification
- **Pattern (Ubiquitous / Permanent)**: EL SISTEMA verificará cada salida generada por el modelo de inteligencia artificial contra el texto fuente mediante un validador determinista Layer-0 que compruebe correspondencia de citas (`sourceQuote`), sustento léxico de cualquier fecha emitida y porcentaje de cobertura de cláusulas accionables.

### FR-CS-005: Dual-Engine Circuit Breaker Resilience
- **Pattern (Error / Unwanted Condition)**: SI el proveedor externo de IA (`gemini-3.8-flash` en `/api/analyze`) no dispone de credencial configurada, supera el umbral de latencia (`8000 ms`) o retorna error de red/cuota, ENTONCES EL SISTEMA conmutará de forma transparente al motor NLP determinista Layer-0 en menos de `10 ms`, preservando el contrato de datos completo e informando el motor utilizado en la telemetría.

### FR-CS-006: Full Interactive CRUD & Multi-View Task Organization
- **Pattern (State-Driven)**: MIENTRAS existan tareas en el espacio de trabajo activo, EL SISTEMA permitirá Crear nuevas tareas manuales, Leerlas y filtrarlas en vistas sincronizadas (Lista densa, Agenda Horaria 06:00–22:00, Tabla Ejecutiva, Tablero Kanban compacto por estado y Lista SharePoint), Actualizar sus atributos (título, prioridad, estado, responsable elegido desde contactos del espacio, hora programada y fecha límite en formato `dd/mm/aaaa`) con persistencia híbrida y Eliminar tareas individuales o reiniciar el tablero.

### FR-CS-007: Enterprise Export & SharePoint / Slack Interoperability
- **Pattern (Event-Driven)**: CUANDO el usuario selecciona una acción de exportación, EL SISTEMA serializará la lista organizada de tareas en formato CSV compatible con Microsoft SharePoint Lists / Planner (con BOM UTF-8), resumen Markdown estructurado para Slack/Teams o contrato JSON verificable.

### FR-CS-008: Integrated Executive Presentation & Evaluation Guide
- **Pattern (Ubiquitous / Permanent)**: EL SISTEMA expondrá una vista interactiva dedicada ("Presentación del Reto") que documente de forma clara y verificable: (1) la solución propuesta, (2) las herramientas utilizadas y su justificación, (3) el funcionamiento paso a paso, (4) las dificultades encontradas y su resolución, (5) las oportunidades de mejora y las respuestas técnicas a las 5 preguntas de sustentación.

### FR-CS-009: Input Validation, Rate Limiting & XSS Immunity
- **Pattern (Error / Unwanted Condition)**: SI una petición excede `4000` caracteres, está vacía, contiene etiquetas HTML/scripts maliciosos o supera el límite de `30` solicitudes por minuto por IP en `/api/analyze`, ENTONCES EL SISTEMA rechazará o sanitizará la entrada de forma segura retornando códigos HTTP semánticos (`400` o `429`) sin exponer trazas internas ni secretos.

### FR-CS-010: Slack-Grade Workspace Shell (Sidebar & Channel Navigation)
- **Pattern (State-Driven)**: MIENTRAS el usuario navega el espacio de trabajo, EL SISTEMA mostrará una barra lateral con el espacio personal privado (`Mi Día (Privado)`), canales colaborativos (con creación, invitación por enlace y eliminación con purga en cascada), mensajes directos con presencia y acciones de app, sincronizará el encabezado del canal con el espacio activo y la convertirá en un panel deslizable accesible en pantallas ≤ `900px`.

### FR-CS-011: Command Palette (Ctrl/Cmd + K)
- **Pattern (Event-Driven)**: CUANDO el usuario pulsa `Ctrl+K` / `Cmd+K` o activa el buscador superior, EL SISTEMA abrirá una paleta modal con filtrado insensible a acentos sobre canales, vistas, acciones, preferencias y tareas existentes, navegable por teclado (`↑ ↓ Enter Esc`) mediante el patrón ARIA combobox/listbox.

### FR-CS-012: Functional Message Composer
- **Pattern (Event-Driven)**: CUANDO el usuario acciona la barra de formato del compositor (o `Ctrl+B` / `Ctrl+I`), EL SISTEMA aplicará sintaxis mrkdwn de Slack (negrita, cursiva, tachado, código, enlace, lista), insertará emojis y menciones en la posición del cursor y ajustará la altura del campo al contenido.

### FR-CS-013: Soft First-Run Auth CTA & Session Integrity (Slack Lists Pattern)
- **Pattern (Event-Driven)**: CUANDO un visitante nuevo o sin sesión activa accede a la aplicación, EL SISTEMA abrirá de inmediato el tablero de demostración (lista + extracción) con un banner no modal de «modo demo», sin auto-iniciar silenciosamente un perfil interno; la pantalla `#slack-auth-gate` (Google OIDC `/api/auth/google` o perfil de equipo explícito) se mostrará solo al elegir «Entrar / Guardar cuenta», al intentar una acción colaborativa que exija identidad, o tras cerrar sesión si el usuario lo solicita. Toda sesión autenticada firmará una cookie `HttpOnly` HMAC-SHA256 verificable en `/api/auth/me`.

### FR-CS-014: Dedicated Private Daily Workspace ("Mi Día (Privado)") & Per-User Task Isolation
- **Pattern (Ubiquitous / Permanent)**: EL SISTEMA proveerá secciones personales privadas protegidas contra borrado (`Mi Día (Privado)` / `personal`, `Mis Proyectos` / `personal-proyectos` y `Notas & Ideas` / `personal-notas`) cuyas tareas locales y en Neon PostgreSQL estarán estrictamente aisladas por la tupla `(userId, channelId)`, rechazando con HTTP `401` cualquier intento de lectura o escritura privada sin identidad de usuario válida.

### FR-CS-015: Multi-Tenant Per-User Workspace Personalization, Scoped Channels & Cloud Preferences
- **Pattern (Event-Driven)**: CUANDO un usuario autenticado con cuenta real inicia sesión, EL SISTEMA personalizará el nombre e iniciales de su espacio de trabajo (`Espacio de <Nombre>`), restaurará sus preferencias visuales (`theme`, `scale`, `layout`) y frase de estado (`status_text`) desde Neon PostgreSQL (`/api/auth/me`), ocultará canales y contactos ficticios de demostración, y filtrará `/api/channels` exclusivamente a los canales creados por ese usuario o a los que se haya unido mediante enlace de invitación (`?join=token`).

### FR-CS-016: Cryptographic Cookie-Only Enforcement for Real OAuth Accounts & Channel Membership Guard
- **Pattern (Error / Unwanted Condition)**: SI una solicitud hacia `/api/tasks`, `/api/channels`, `/api/messages` o `/api/auth/me` intenta actuar bajo una identidad real de Google (`usr_g_*`) sin presentar una cookie firmada `HttpOnly` HMAC-SHA256 válida (`taskflow_session`), o intenta acceder a un canal privado/personalizado ajeno sin membresía en `channel_members`, ENTONCES EL SISTEMA rechazará la petición con HTTP `401` o `403`.

### FR-CS-017: Real-Time Collaborative Task Board Synchronization
- **Pattern (State-Driven)**: MIENTRAS el usuario visualice un canal colaborativo compartido sin estar editando una tarea en modal, EL SISTEMA sincronizará periódicamente el tablero contra `/api/tasks` comparando `checksum` para reflejar en tiempo real las tareas creadas, editadas o completadas por otros miembros del canal.

### FR-CS-018: Persistent Task-Level Discussion Threads in PostgreSQL
- **Pattern (Event-Driven)**: CUANDO el usuario abre el diálogo `💬 Hilo` de una tarea o publica una respuesta, EL SISTEMA recuperará y almacenará los comentarios asociados con `parent_id = task.id` en Neon PostgreSQL (`/api/messages`), excluyéndolos del feed principal del canal para mantener conversaciones enfocadas por tarea.

### FR-CS-019: Direct Email (.eml) & Chat (.txt, .md) File Ingestion + Gemini Hourly Schema
- **Pattern (Event-Driven)**: CUANDO el usuario adjunta o arrastra un archivo `.eml` (correo electrónico RFC 5322) o `.txt`/`.md` (chat de WhatsApp/Slack/notas) al compositor, EL SISTEMA decodificará cabeceras y cuerpo plano en cliente, seleccionará automáticamente el canal fuente y extraerá tareas y horas programadas (`scheduledTime` `HH:mm`) verificadas contra alucinación temporal.

---

## 3. Non-Functional Requirements (NFR)
1. **NFR-001 (Layer-0 Purity)**: Zero external runtime npm dependencies (`dependencies: {}`).
2. **NFR-002 (Accessibility)**: WCAG 2.1 Level AA compliance (`skip-link`, semantic landmarks, `aria-live="polite"`, keyboard navigation, `<dialog closedby="any">`, contrast ratio >= 4.5:1).
3. **NFR-003 (Performance)**: Core Web Vitals budget — CSS < `45 KB`, UI JS < `55 KB`, deterministic engine latency < `5 ms`, `content-visibility: auto`.
4. **NFR-004 (Security)**: Strict CSP, HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, zero plaintext secrets, <= 12 Vercel Serverless Functions.

---

## 4. Acceptance Criteria (BDD Gherkin Standard)

```gherkin
ESCENARIO: BDD-CS-001: Extracción exacta y sin alucinaciones del caso oficial de reunión del viernes
  DADO el mensaje "Hola, necesitamos preparar la reunión del equipo para el viernes. Hay que revisar los resultados del mes, actualizar la presentación y enviar la agenda a los participantes antes de la reunión." y una fecha de referencia conocida
  CUANDO el usuario ejecuta el análisis de tareas con IA
  ENTONCES el sistema identifica las 4 actividades ("Revisar los resultados del mes", "Actualizar la presentación", "Enviar la agenda a los participantes", "Preparar la reunión del equipo")
  Y asigna prioridades coherentes con el orden lógico de dependencia (revisar resultados -> actualizar presentación / enviar agenda antes de la reunión -> reunión del viernes)
  Y ancla el viernes para la reunión señalando explícitamente la información faltante (hora exacta, fechas intermedias, responsables y lista de participantes) sin inventar fechas falsas.

ESCENARIO: BDD-CS-002: Guardia Anti-Alucinación ante fechas inventadas por un modelo generativo
  DADO un mensaje que no menciona ninguna fecha ni referencia temporal ("Necesitamos auditar los permisos del sitio de SharePoint y actualizar la documentación del equipo")
  CUANDO una salida candidata de IA intenta asignar una fecha calendario arbitraria como "2026-11-15"
  ENTONCES el verificador determinista detecta ausencia de ancla temporal en el texto fuente
  Y revoca la fecha inventada marcando la tarea como "MISSING_INFO" ("Fecha límite no especificada en la solicitud").

ESCENARIO: BDD-CS-003: Ciclo completo CRUD y resolución de información faltante
  DADO un conjunto de tareas extraídas en el tablero activo
  CUANDO el usuario crea una tarea adicional, actualiza la fecha faltante y el estado de una tarea existente a "COMPLETED" y elimina una tarea descartada
  ENTONCES todas las vistas (Tabla, Kanban, Métricas) y la persistencia local reflejan el estado actualizado de forma atómica
  Y el contador de alertas de información faltante disminuye dinámicamente.

ESCENARIO: BDD-CS-004: Resiliencia Circuit-Breaker ante ausencia o fallo de API externa
  DADO el endpoint /api/analyze ejecutándose sin GEMINI_API_KEY o bajo fallo simulado de red
  CUANDO se solicita analizar un mensaje de correo o Slack
  ENTONCES el Circuit Breaker conmuta al motor determinista Layer-0 retornando HTTP 200 con tareas válidas y verificadas
  Y reporta transparentemente el modo de motor activo sin interrumpir la experiencia del usuario.

ESCENARIO: BDD-CS-005: Exportación interoperable a SharePoint Lists CSV y Slack Markdown
  DADO un tablero con tareas organizadas, prioridades y alertas de datos faltantes
  CUANDO el usuario acciona la exportación a CSV para SharePoint/Planner o resumen Markdown
  ENTONCES el sistema genera un artefacto bien formado con codificación UTF-8 segura contra CSV Injection (neutralizando prefijos =, +, -, @)
  Y conserva prioridades, estados, fechas resueltas y notas de información faltante.

ESCENARIO: BDD-CS-006: First-run abierto con CTA de autenticación bajo demanda
  DADO un navegador sin sesión previa en localStorage ni cookie HttpOnly taskflow_session
  CUANDO el visitante abre la aplicación por primera vez
  ENTONCES el sistema muestra el tablero de trabajo (compositor + lista) con un banner de modo demo y #slack-auth-gate permanece oculto
  Y NO inicia sesión automáticamente con ningún perfil interno
  Y al pulsar «Entrar / Guardar cuenta» o una acción colaborativa que exija identidad, ENTONCES aparece #slack-auth-gate con Google OIDC y perfiles de demostración explícitos.

ESCENARIO: BDD-CS-007: Aislamiento estricto por usuario en "Mi Día (Privado)"
  DADO un usuario autenticado A que guarda tareas con hora programada en la sección "Mi Día (Privado)" (channelId = "personal")
  CUANDO otro usuario B consulta "Mi Día (Privado)" o se intenta consultar sin identidad autenticada
  ENTONCES el endpoint /api/tasks rechaza peticiones sin identidad con HTTP 401 y aísla las filas por (user_id, channel_id)
  Y los espacios personales ("personal", "personal-proyectos", "personal-notas") permanecen protegidos contra eliminación en /api/channels (HTTP 400).

ESCENARIO: BDD-CS-008: Personalización multi-usuario e historial independiente por cuenta
  DADO un usuario real A que inicia sesión con Google, elige tema "dark", crea un canal "#trabajo" y guarda tareas en sus listas privadas
  CUANDO otro usuario real B inicia sesión en el mismo navegador o en otro dispositivo
  ENTONCES el usuario B ve su propio encabezado "Espacio de <NombreB>", sus propias listas personales vacías, su propio tema visual y cero canales o contactos ajenos
  Y solo accede al canal "#trabajo" del usuario A si abre explícitamente un enlace de invitación válido (?join=token).

ESCENARIO: BDD-CS-009: Blindaje criptográfico Cookie-Only contra suplantación de cuentas Google
  DADO un atacante externo que conoce el identificador "usr_g_100470499712704597932" pero carece de la cookie firmada HttpOnly taskflow_session
  CUANDO envía peticiones directas a /api/tasks, /api/channels o /api/auth/me pasando userId="usr_g_100470499712704597932"
  ENTONCES el servidor rechaza la suplantación con HTTP 401 (o devuelve lista vacía sin exponer canales privados)
  Y solo autoriza operaciones cuando la firma HMAC-SHA256 de la cookie coincide con dicho usuario.

ESCENARIO: BDD-CS-010: Hilos de discusión persistentes por tarea y sincronización colaborativa
  DADO un canal compartido donde el usuario A abre "💬 Hilo" en una tarea y publica un acuerdo de seguimiento
  CUANDO el usuario B abre "💬 Hilo" sobre esa misma tarea o permanece en el canal compartido
  ENTONCES el comentario aparece persistido bajo parent_id = task.id sin contaminar el chat general del canal
  Y cualquier cambio de estado en las tareas se refleja automáticamente por comparación de checksum.

ESCENARIO: BDD-CS-011: Ingesta directa de archivos de correo (.eml) y chat (.txt)
  DADO un archivo de correo .eml con cabeceras Subject/From y cuerpo Quoted-Printable o un chat exportado de WhatsApp .txt
  CUANDO el usuario lo adjunta o arrastra sobre el compositor
  ENTONCES el sistema extrae el texto limpio, selecciona el canal correspondiente ("email" o "whatsapp") y genera las tareas priorizadas y verificadas.

ESCENARIO: BDD-CS-012: Generaci?n de Resumen Ejecutivo y Resoluci?n de Conflictos de Horario
  DADO un tablero con tareas activas donde dos entregas coinciden en horario (09:00 y 09:30 con duraciones solapadas)
  CUANDO el usuario abre el di?logo "?? Resumen Ejecutivo" y pulsa "? Resolver Colisiones Autom?ticamente"
  ENTONCES el sistema detecta la superposici?n de intervalos, recalcula los horarios escalon?ndolos con un margen de amortiguaci?n
  Y actualiza el estado de las tareas localmente y en la base de datos sin duplicaciones ni p?rdida de dependencias.

ESCENARIO: BDD-CS-013: Registro de Auditor?a Inmutable por Tarea
  DADO una tarea existente en el espacio de trabajo
  CUANDO el usuario cambia su estado de "PENDING" a "IN_PROGRESS" o ajusta su fecha l?mite
  ENTONCES el sistema registra una entrada inmutable con marca de tiempo, actor, campos modificados y valores previo/nuevo
  Y la lista de auditor?a renderiza la cronolog?a completa de forma legible y accesible.
```
