import { translator } from "./language";

/** Copy del equipo; los valores de catálogo y datos del usuario se conservan. */
export const copy = {
  "current": { "es": "Vigentes", "en": "Current" },
  "text001": {
    "es": "Todos",
    "en": "All"
  },
  "text002": {
    "es": "Activos",
    "en": "Active"
  },
  "text003": {
    "es": "Borradores",
    "en": "Drafts"
  },
  "text004": {
    "es": "Archivados",
    "en": "Archived"
  },
  "text005": {
    "es": "ACTIVO",
    "en": "ACTIVE"
  },
  "text006": {
    "es": "BORRADOR",
    "en": "DRAFT"
  },
  "text007": {
    "es": "ARCHIVADO",
    "en": "ARCHIVED"
  },
  "text008": {
    "es": "Nombre de la nueva lista (la copia nace como borrador v1):",
    "en": "New template name (the copy starts as a v1 draft):"
  },
  "text009": {
    "es": "{0} (copia)",
    "en": "{0} (copy)"
  },
  "text010": {
    "es": "Lista duplicada como borrador: {0}",
    "en": "Template duplicated as draft: {0}"
  },
  "text011": {
    "es": "Lista archivada (reversible).",
    "en": "Template archived (reversible)."
  },
  "text012": {
    "es": "Lista restaurada como activa.",
    "en": "Template restored as active."
  },
  "text013": {
    "es": "Listas reutilizables de carriers para cargar en un evento",
    "en": "Reusable lists with exact membership · shared with rateware"
  },
  "text014": {
    "es": "Actualizar",
    "en": "Refresh"
  },
  "text015": {
    "es": "+ Nueva lista",
    "en": "+ New template"
  },
  "text016": {
    "es": "Membresía estática:",
    "en": "Static membership:"
  },
  "text017": {
    "es": "editar el perfil de un carrier no cambia la lista. Cargar una lista nunca crea carriers ni envía invitaciones — solo prepara una selección para Carrier Fit.",
    "en": "editing a carrier profile does not change the list. Loading a template never creates carriers or sends invitations — it only prepares a selection for Carrier Fit."
  },
  "text018": {
    "es": "Buscar listas…",
    "en": "Search templates…"
  },
  "text019": {
    "es": "Cargando listas…",
    "en": "Loading templates…"
  },
  "text020": {
    "es": "Miembros",
    "en": "Members"
  },
  "text021": {
    "es": "Estado",
    "en": "Status"
  },
  "text022": {
    "es": "Actualizado",
    "en": "Updated"
  },
  "text023": {
    "es": "Acciones",
    "en": "Actions"
  },
  "text024": {
    "es": "Restaurar",
    "en": "Restore"
  },
  "text025": {
    "es": "Abrir",
    "en": "Open"
  },
  "text026": {
    "es": "Duplicar",
    "en": "Duplicate"
  },
  "text027": {
    "es": "Ninguna lista con este filtro",
    "en": "No templates with this filter"
  },
  "text028": {
    "es": "No hay listas",
    "en": "No templates"
  },
  "text029": {
    "es": "Cambia el filtro o la búsqueda.",
    "en": "Change the filter or search."
  },
  "text030": {
    "es": "Crea el primero con + Nueva lista.",
    "en": "Create the first with + New template."
  },
  "text031": {
    "es": "Elige una lista de la lista para ver su detalle.",
    "en": "Choose a template from the list to see its details."
  },
  "text032": {
    "es": "Descripción",
    "en": "Description"
  },
  "text033": {
    "es": "no visible para tu usuario",
    "en": "not visible to your account"
  },
  "text034": {
    "es": " más",
    "en": " more"
  },
  "text035": {
    "es": "Última modificación",
    "en": "Last modified"
  },
  "text036": {
    "es": "Creado por",
    "en": "Created by"
  },
  "text037": {
    "es": "Usar en Carrier Fit",
    "en": "Use in Carrier Fit"
  },
  "text038": {
    "es": "Editar",
    "en": "Edit"
  },
  "text039": {
    "es": "Archivar",
    "en": "Archive"
  },
  "text040": {
    "es": "Un borrador no se carga en Carrier Fit: actívalo al editarlo.",
    "en": "A draft cannot be loaded in Carrier Fit: activate it when editing."
  },
  "text041": {
    "es": "La membresía es estática. Editar un perfil de carrier no cambia esta lista.",
    "en": "Membership is static. Editing a carrier profile does not change this list."
  },
  "text042": {
    "es": "Datos",
    "en": "Details"
  },
  "text043": {
    "es": "Agregar carriers",
    "en": "Add carriers"
  },
  "text044": {
    "es": "Revisar",
    "en": "Review"
  },
  "text045": {
    "es": "Guardar",
    "en": "Save"
  },
  "text046": {
    "es": "pegado desde la hoja",
    "en": "pasted from the spreadsheet"
  },
  "text047": {
    "es": "Cargando lista…",
    "en": "Loading template…"
  },
  "text048": {
    "es": "Nueva lista",
    "en": "New template"
  },
  "text049": {
    "es": "Editar · {0}",
    "en": "Edit · {0}"
  },
  "text050": {
    "es": "Nueva lista de carriers",
    "en": "Create carrier list template"
  },
  "text051": {
    "es": "Versión {0} · guardar crea la {1}",
    "en": "Version {0} · saving creates {1}"
  },
  "text052": {
    "es": "Una lista reutilizable de carriers para cargar en un evento",
    "en": "Reusable list with exact membership · shared with rateware"
  },
  "text053": {
    "es": "Cancelar",
    "en": "Cancel"
  },
  "text054": {
    "es": "Guardar borrador",
    "en": "Save draft"
  },
  "text055": {
    "es": "Revisar lista",
    "en": "Review template"
  },
  "text056": {
    "es": "Guardando…",
    "en": "Saving…"
  },
  "text057": {
    "es": "Guardar versión",
    "en": "Save version"
  },
  "text058": {
    "es": "Crear y activar",
    "en": "Create and activate"
  },
  "text059": {
    "es": "Crear lista",
    "en": "Create template"
  },
  "text060": {
    "es": "Pasos",
    "en": "Steps"
  },
  "text061": {
    "es": "Nombre de la lista *",
    "en": "Template name *"
  },
  "text062": {
    "es": "Estado al guardar",
    "en": "Status on save"
  },
  "text063": {
    "es": "Borrador",
    "en": "Draft"
  },
  "text064": {
    "es": "Activo",
    "en": "Active"
  },
  "text065": {
    "es": "Solo una lista ",
    "en": "Only an "
  },
  "text066": {
    "es": "activo",
    "en": "active"
  },
  "text067": {
    "es": " se carga en Carrier Fit. Un borrador sirve para prepararlo sin que nadie lo use todavía.",
    "en": " can be loaded in Carrier Fit. A draft lets you prepare it before anyone uses it."
  },
  "text068": {
    "es": "editar el perfil de un carrier después no cambia esta lista. Guardar nunca crea carriers ni envía nada.",
    "en": "editing a carrier profile later does not change this list. Saving never creates carriers or sends anything."
  },
  "text069": {
    "es": "Seleccionar del Carrier CRM",
    "en": "Select from Carrier CRM"
  },
  "text070": {
    "es": "Cargar CSV / XLSX",
    "en": "Upload CSV / XLSX"
  },
  "text071": {
    "es": "Fuente: Carrier CRM.",
    "en": "Source: Carrier CRM (vendors) in Supabase."
  },
  "text072": {
    "es": "Solo se agregan carriers existentes; nunca se crean.",
    "en": "Only existing carriers are added; none are created. The same table used by rateware."
  },
  "text073": {
    "es": "1 · Carriers del Carrier CRM",
    "en": "1 · Carriers in Carrier CRM"
  },
  "text074": {
    "es": "{0} encontrados",
    "en": "{0} found"
  },
  "text075": {
    "es": " · búsqueda + filtros de base, cobertura y contacto",
    "en": " · search + base, coverage and contact filters"
  },
  "text076": {
    "es": "Nombre, dominio o correo…",
    "en": "Name, domain or email…"
  },
  "text077": {
    "es": "Cobertura (ej. Laredo)",
    "en": "Coverage (e.g. Laredo)"
  },
  "text078": {
    "es": "Todas las bases",
    "en": "All bases"
  },
  "text079": {
    "es": "con contacto",
    "en": "with contact"
  },
  "text080": {
    "es": "Buscar",
    "en": "Search"
  },
  "text081": {
    "es": "Ya está en la lista",
    "en": "Already in the template"
  },
  "text082": {
    "es": "Bloqueado: no se le puede invitar",
    "en": "Blocked: cannot be invited"
  },
  "text083": {
    "es": "bloqueado",
    "en": "blocked"
  },
  "text084": {
    "es": "Sí",
    "en": "Yes"
  },
  "text085": {
    "es": "No",
    "en": "No"
  },
  "text086": {
    "es": "Sin carriers con estos filtros.",
    "en": "No carriers with these filters."
  },
  "text087": {
    "es": "Agregar →",
    "en": "Add →"
  },
  "text088": {
    "es": "← Quitar",
    "en": "← Remove"
  },
  "text089": {
    "es": "Subir archivo",
    "en": "Upload file"
  },
  "text090": {
    "es": "CSV, TSV o Excel. Columnas que reconoce: ID de CRM, USDOT, MC, correo, nombre del carrier — en español o inglés. Hasta ",
    "en": "CSV, TSV or Excel. Recognized columns: CRM ID, USDOT, MC, email, carrier name — in Spanish or English. Up to "
  },
  "text091": {
    "es": " filas.",
    "en": " rows."
  },
  "text092": {
    "es": "…o pega desde la hoja de cálculo",
    "en": "…or paste from the spreadsheet"
  },
  "text093": {
    "es": "Nombre del transportista\tUSDOT\tCorreo principal\nTransportes Foo, S.A. de C.V.\t1234567\tventas@foo.mx",
    "en": "Carrier name USDOT Primary email Example Transport LLC 1234567 sales@example.test"
  },
  "text094": {
    "es": "Ninguna fila se descarta sola: las que coinciden por ID, USDOT, MC o correo entran directo; una coincidencia solo por nombre ",
    "en": "No row is discarded automatically: matches by ID, USDOT, MC or email are added directly; a name-only match "
  },
  "text095": {
    "es": "nunca",
    "en": "never"
  },
  "text096": {
    "es": " se asigna sola. Lo demás espera tu decisión.",
    "en": " is assigned automatically. Everything else waits for your decision."
  },
  "text097": {
    "es": "Resolviendo…",
    "en": "Resolving…"
  },
  "text098": {
    "es": "Resolver pegado",
    "en": "Resolve pasted rows"
  },
  "text099": {
    "es": "Resolviendo contra el Carrier CRM…",
    "en": "Resolving against Carrier CRM…"
  },
  "text100": {
    "es": "Fila",
    "en": "Row"
  },
  "text101": {
    "es": "En la hoja",
    "en": "In the spreadsheet"
  },
  "text102": {
    "es": "Resultado",
    "en": "Result"
  },
  "text103": {
    "es": "Decisión",
    "en": "Decision"
  },
  "text104": {
    "es": "(sin nombre)",
    "en": "(unnamed)"
  },
  "text105": {
    "es": "COINCIDE",
    "en": "MATCH"
  },
  "text106": {
    "es": "AMBIGUA",
    "en": "AMBIGUOUS"
  },
  "text107": {
    "es": "REPETIDA",
    "en": "REPEATED"
  },
  "text108": {
    "es": "SIN MATCH",
    "en": "NO MATCH"
  },
  "text109": {
    "es": "Cambiar",
    "en": "Change"
  },
  "text110": {
    "es": "ya está en la lista",
    "en": "already in the list"
  },
  "text111": {
    "es": "omitida a propósito",
    "en": "intentionally skipped"
  },
  "text112": {
    "es": "Deshacer",
    "en": "Undo"
  },
  "text113": {
    "es": "Usar: ",
    "en": "Use: "
  },
  "text114": {
    "es": "Buscar en el CRM…",
    "en": "Search CRM…"
  },
  "text115": {
    "es": "Omitir esta fila",
    "en": "Skip this row"
  },
  "text116": {
    "es": " coinciden",
    "en": " matched"
  },
  "text117": {
    "es": " por decidir",
    "en": " awaiting decision"
  },
  "text118": {
    "es": " repetidas (deduplicadas)",
    "en": " duplicates (deduplicated)"
  },
  "text119": {
    "es": " omitidas a propósito",
    "en": " intentionally skipped"
  },
  "text120": {
    "es": "Las cargas nunca crean carriers",
    "en": "Uploads never create carriers"
  },
  "text121": {
    "es": "Descargar excepciones (CSV)",
    "en": "Download exceptions (CSV)"
  },
  "text122": {
    "es": "Agregados del CRM",
    "en": "Added from CRM"
  },
  "text123": {
    "es": "Importados e incluidos",
    "en": "Imported and included"
  },
  "text124": {
    "es": "Filas omitidas a propósito",
    "en": "Intentionally skipped rows"
  },
  "text125": {
    "es": "Quedan {0} fila(s) importadas sin decidir. Resuélvelas en \"Agregar carriers\": elige un candidato, búscalo en el CRM, u omítela a propósito.",
    "en": "{0} imported row(s) still need a decision. Resolve them in “Add carriers”: choose a candidate, find it in CRM or skip it intentionally."
  },
  "text126": {
    "es": "Edición segura:",
    "en": "Safe editing:"
  },
  "text127": {
    "es": "se guarda contra la versión ",
    "en": "saved against version "
  },
  "text128": {
    "es": ". Si alguien la modificó mientras la tenías abierta, el backend responde en vez de pisar su cambio.",
    "en": ". If someone changed it while you had it open, the backend responds instead of overwriting their change."
  },
  "text129": {
    "es": "2 · Miembros de la lista",
    "en": "2 · Template members"
  },
  "text130": {
    "es": " seleccionados · membresía exacta",
    "en": " selected · exact membership"
  },
  "text131": {
    "es": "Marcar {0}",
    "en": "Select {0}"
  },
  "text132": {
    "es": "hoja",
    "en": "spreadsheet"
  },
  "text133": {
    "es": "Quitar de la lista",
    "en": "Remove from template"
  },
  "text134": {
    "es": "Aún no hay miembros. Márcalos a la izquierda y usa Agregar →.",
    "en": "No members yet. Select them on the left and use Add →."
  }
};

export const tr = translator(copy);

const extraCopy={
  "catalogChanged": {
    "es": "No se pudo cargar la biblioteca completa. El catálogo cambió durante la lectura o devolvió una página incompleta. Pulsa Actualizar.",
    "en": "The complete library could not be loaded. The catalog changed during the read or returned an incomplete page. Click Refresh."
  },
  "catalogTooLarge": {
    "es": "La biblioteca supera el límite de carga de 10,000 plantillas. No se mostrará un resultado parcial.",
    "en": "The library exceeds the 10,000-template loading limit. A partial result will not be shown."
  },
  "extra0": {
    "es": "(sin nombre)",
    "en": "(unnamed)"
  },
  "extra1": {
    "es": "Ya existe una lista con ese nombre en la organización.",
    "en": "A template with that name already exists in the organization."
  },
  "extra2": {
    "es": "{0} Recarga: alguien más la editó mientras la tenías abierta.",
    "en": "{0} Reload: someone else edited it while you had it open."
  },
  "extra3": {
    "es": "La lista ya no está activa. Solo una lista activa puede cargarse en un evento.",
    "en": "The template is no longer active. Only an active template can be loaded in an event."
  },
  "extra4": {
    "es": "Tu usuario no tiene organización asignada en Supabase (app_metadata.rateware_organization_id). Pídela antes de operar listas.",
    "en": "Your Supabase account has no assigned organization (app_metadata.rateware_organization_id). Request one before working with templates."
  },
  "extra5": {
    "es": "Falta el permiso vendors:manage en tu usuario de Supabase; puedes ver listas pero no editarlos.",
    "en": "Your Supabase account lacks vendors:manage permission; you can view templates but cannot edit them."
  },
  "extra6": {
    "es": "La API de listas de carriers está apagada en este entorno.",
    "en": "The carrier list templates API is disabled in this environment."
  },
  "extra7": {
    "es": "No encontré encabezados reconocibles. La hoja necesita al menos una columna de: ID de CRM, USDOT, MC, correo o nombre del carrier.",
    "en": "No recognizable headers found. The sheet needs at least one column: CRM ID, USDOT, MC, email or carrier name."
  },
  "extra8": {
    "es": "El archivo no tiene una primera hoja legible.",
    "en": "The file has no readable first worksheet."
  },
  "extra9": {
    "es": "Formato no soportado. Usa CSV, TSV o Excel (.xlsx).",
    "en": "Unsupported format. Use CSV, TSV or Excel (.xlsx)."
  },
  "extra10": {
    "es": "La hoja no trae filas con datos.",
    "en": "The sheet has no data rows."
  },
  "extra11": {
    "es": "El backend resuelve hasta {0} carriers por carga y la hoja trae {1}. Divídela.",
    "en": "The backend resolves up to {0} carriers per upload; the sheet contains {1}. Split it."
  }
};
export const extra=translator(extraCopy);

const wordCopy={
  "word0": {
    "es": "buscando…",
    "en": "searching…"
  },
  "word1": {
    "es": "sin identificadores",
    "en": "no identifiers"
  },
  "word2": {
    "es": "ID de CRM",
    "en": "CRM ID"
  },
  "word3": {
    "es": "correo",
    "en": "email"
  },
  "word4": {
    "es": "solo por nombre",
    "en": "name only"
  },
  "word5": {
    "es": "ya incluido en otra fila",
    "en": "already included in another row"
  },
  "word6": {
    "es": "la fila no trae ningún identificador",
    "en": "the row has no identifier"
  },
  "word7": {
    "es": "el ID no existe en esta organización",
    "en": "the ID does not exist in this organization"
  },
  "word8": {
    "es": "sin coincidencias en el CRM",
    "en": "no CRM matches"
  }
};
export const words=translator(wordCopy);
