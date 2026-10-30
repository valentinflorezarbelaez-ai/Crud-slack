<#
.SYNOPSIS
    Script de aprovisionamiento automatizado para Microsoft SharePoint Online (PnP.PowerShell).
    Crea la lista personalizada 'TaskFlow_Actividades' con todos los campos, opciones y vistas
    necesarios para recibir las tareas organizadas por TaskFlow AI desde correos o Teams.

.DESCRIPTION
    Alineado con el perfil técnico de Luis Soto (Desarrollador Software Plataforma SharePoint).
    Gobernado por SPEC-CRUD-SLACK-001 (ADR-CS-002: Microsoft 365 & SharePoint Custom List Contract).

.EXAMPLE
    .\Provision-TaskFlowSharePointList.ps1 -SiteUrl "https://tuempresa.sharepoint.com/sites/Operaciones"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, HelpMessage = "URL del sitio de SharePoint Online destino")]
    [string]$SiteUrl,

    [Parameter(Mandatory = $false)]
    [string]$ListName = "TaskFlow_Actividades",

    [Parameter(Mandatory = $false)]
    [string]$ListDescription = "Lista corporativa de tareas generadas automáticamente por TaskFlow AI a partir de correos y chats con auditoría anti-alucinación."
)

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " TASKFLOW AI — MICROSOFT SHAREPOINT ONLINE PROVISIONING SUITE (PNP)   " -ForegroundColor Cyan
Write-Host " Autor: Valentín Flórez Arbeláez | Evaluador: Luis Soto               " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Verificar módulo PnP.PowerShell
if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
    Write-Warning "El módulo PnP.PowerShell no está instalado en este equipo."
    Write-Host "Ejecuta: Install-Module -Name PnP.PowerShell -Scope CurrentUser" -ForegroundColor Yellow
    exit 1
}

# 2. Conectar al Sitio de SharePoint Online
Write-Host "[1/5] Conectando a SharePoint Online: $SiteUrl..." -ForegroundColor Green
Connect-PnPOnline -Url $SiteUrl -Interactive

# 3. Crear o verificar la Lista
Write-Host "[2/5] Verificando lista '$ListName'..." -ForegroundColor Green
$list = Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue

if ($null -eq $list) {
    Write-Host "Creando lista '$ListName'..." -ForegroundColor Yellow
    $list = New-PnPList -Title $ListName -Template GenericList -EnableVersioning $true
    Set-PnPList -Identity $ListName -Description $ListDescription
    Write-Host "✔ Lista '$ListName' creada con control de versiones activado." -ForegroundColor Green
} else {
    Write-Host "✔ Lista '$ListName' ya existe en el sitio." -ForegroundColor Green
}

# 4. Crear Columnas Personalizadas del Esquema TaskFlow
Write-Host "[3/5] Aprovisionando columnas corporativas..." -ForegroundColor Green

# 4.1 Prioridad (Choice)
$prioField = Get-PnPField -List $ListName -Identity "Prioridad" -ErrorAction SilentlyContinue
if ($null -eq $prioField) {
    Add-PnPField -List $ListName -DisplayName "Prioridad" -InternalName "Prioridad" -Type Choice -Choices @("Crítica (P0)", "Alta (P1)", "Media (P2)", "Baja (P3)") -AddToDefaultView | Out-Null
    Write-Host "  ✔ Campo 'Prioridad' (Choice) creado." -ForegroundColor Gray
}

# 4.2 Estado de Tarea (Choice)
$statusField = Get-PnPField -List $ListName -Identity "EstadoTarea" -ErrorAction SilentlyContinue
if ($null -eq $statusField) {
    Add-PnPField -List $ListName -DisplayName "Estado de la Tarea" -InternalName "EstadoTarea" -Type Choice -Choices @("Pendiente", "En progreso", "Completada") -AddToDefaultView | Out-Null
    Write-Host "  ✔ Campo 'Estado de la Tarea' (Choice) creado." -ForegroundColor Gray
}

# 4.3 Fecha Límite (DateTime - Solo Fecha)
$dateField = Get-PnPField -List $ListName -Identity "FechaLimite" -ErrorAction SilentlyContinue
if ($null -eq $dateField) {
    Add-PnPField -List $ListName -DisplayName "Fecha Límite" -InternalName "FechaLimite" -Type DateTime -AddToDefaultView | Out-Null
    Write-Host "  ✔ Campo 'Fecha Límite' (DateTime) creado." -ForegroundColor Gray
}

# 4.4 Estado de Fecha (Choice: Confirmada / Parcial / Faltante)
$dateStateField = Get-PnPField -List $ListName -Identity "EstadoFecha" -ErrorAction SilentlyContinue
if ($null -eq $dateStateField) {
    Add-PnPField -List $ListName -DisplayName "Estado de Fecha" -InternalName "EstadoFecha" -Type Choice -Choices @("Confirmada", "Referencia Parcial", "Información Faltante") -AddToDefaultView | Out-Null
    Write-Host "  ✔ Campo 'Estado de Fecha' (Choice) creado." -ForegroundColor Gray
}

# 4.5 Detalle Temporal / Información Faltante (Note)
$missingField = Get-PnPField -List $ListName -Identity "DetalleFaltante" -ErrorAction SilentlyContinue
if ($null -eq $missingField) {
    Add-PnPField -List $ListName -DisplayName "Detalle Temporal / Faltante" -InternalName "DetalleFaltante" -Type Note -AddToDefaultView | Out-Null
    Write-Host "  ✔ Campo 'Detalle Temporal / Faltante' (Note) creado." -ForegroundColor Gray
}

# 4.6 Responsable Sugerido (Text)
$assigneeField = Get-PnPField -List $ListName -Identity "Responsable" -ErrorAction SilentlyContinue
if ($null -eq $assigneeField) {
    Add-PnPField -List $ListName -DisplayName "Responsable" -InternalName "Responsable" -Type Text -AddToDefaultView | Out-Null
    Write-Host "  ✔ Campo 'Responsable' (Text) creado." -ForegroundColor Gray
}

# 4.7 Canal de Origen (Choice)
$channelField = Get-PnPField -List $ListName -Identity "CanalOrigen" -ErrorAction SilentlyContinue
if ($null -eq $channelField) {
    Add-PnPField -List $ListName -DisplayName "Canal de Origen" -InternalName "CanalOrigen" -Type Choice -Choices @("Email", "Slack", "Teams", "WhatsApp") -AddToDefaultView | Out-Null
    Write-Host "  ✔ Campo 'Canal de Origen' (Choice) creado." -ForegroundColor Gray
}

# 4.8 Cita Textual Fuente (Anti-Alucinación Grounding)
$quoteField = Get-PnPField -List $ListName -Identity "CitaTextualFuente" -ErrorAction SilentlyContinue
if ($null -eq $quoteField) {
    Add-PnPField -List $ListName -DisplayName "Cita Textual Fuente" -InternalName "CitaTextualFuente" -Type Note -AddToDefaultView | Out-Null
    Write-Host "  ✔ Campo 'Cita Textual Fuente' (Note) creado." -ForegroundColor Gray
}

# 5. Configurar Vistas de Lista Modernas
Write-Host "[4/5] Creando vistas especializadas en SharePoint..." -ForegroundColor Green

# Vista: Tareas con Información Faltante
$missingView = Get-PnPView -List $ListName -Identity "Tareas con Info Faltante" -ErrorAction SilentlyContinue
if ($null -eq $missingView) {
    $camlQuery = "<Where><Neq><FieldRef Name='EstadoFecha'/><Value Type='Choice'>Confirmada</Value></Neq></Where>"
    Add-PnPView -List $ListName -Title "Tareas con Info Faltante" -Fields "Title", "Prioridad", "EstadoFecha", "DetalleFaltante", "Responsable", "Created" -Query $camlQuery | Out-Null
    Write-Host "  ✔ Vista 'Tareas con Info Faltante' creada." -ForegroundColor Gray
}

# 6. Finalización
Write-Host "[5/5] Lista lista y verificada para integración con Power Automate." -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " ¡APROVISIONAMIENTO EXITOSO! Lista: $ListName en $SiteUrl" -ForegroundColor Cyan
Write-Host " Puedes usar el endpoint https://crud-slack.vercel.app/api/analyze" -ForegroundColor Cyan
Write-Host " en tu flujo de Power Automate para insertar ítems automáticamente." -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
