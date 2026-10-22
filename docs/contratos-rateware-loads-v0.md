# Inventario de contratos con Rateware y Loads · v0

Fr8Bid, Bid Room de MARKSMAN. Primer entregable del mandato, parte 2. Complementa `docs/recorrido-rfx-v0.md` (recorrido, modelo y reglas I1–I12) y resuelve la condición de la decisión D1.

Fuentes leídas, solo consulta, sin ejecutar nada contra producción:

- Migración `20261018030000_rfx_handoff_atomic.sql` y `rateware-api/index.ts` del paquete de publicación del Sprint 19, guardados en `D:\andre\repos\Bidware\.artifacts\s19-handoff-bi-compat-20261018\release-check\` (es la copia que se aplicó en producción como ledger `20261018090955`; API 702 y 703 conservan ese contrato). El worktree `radar-rfi-git-close-20261015` (59337fab) no la contiene.
- Del worktree de Rateware: `rfx-bid-api/index.ts`, `_shared/team-roles.ts`, `_shared/auth.ts`, `_shared/action-contract-rfx-award-atomic.mjs`, `quotedesk-api/spot-conversion.ts`.
- De Loads: `packages/shared-contracts`, `packages/rateware-client` (`private-book-projection.mjs`, `normalize-board.mjs`), ADR 0022 y 0023.
- De `bidware-contexto`: LEEME, conciliación 18/oct, cierre técnico Sprint 19, aceptación operativa 20/oct.

Límite de la lectura: Rateware main vigente es `b11991f8` (API 705). No hay checkout local de ese commit; lo que aquí se dice del handoff viene del paquete del Sprint 19 y debe confirmarse contra main antes de construir sobre él. Nada de lo leído sugiere que 704 o 705 cambiaran el handoff (fueron WhatsApp y teléfono).

---

## 1. Respuesta a D1

**Pregunta.** ¿Puede `rfx_handoff_atomic` / `closeoutAwardedRfxToRateware` recibir un payload externo (adjudicación + versión de oferta con huella SHA-256) sin depender de filas en `rfx_lane_vendors` y `rate_staging`?

**Respuesta: No.** Por cuatro razones que están en el código:

1. **La entrada no admite payload.** `closeoutAwardedRfxToRateware` solo acepta `event_id` y `operation_id`. Su petición canónica es literalmente `{ event_id, target_status: "pending_review" }`. Todo lo demás (ruta, carrier, importe, moneda, modelo comercial) lo lee de `rfx_events`, `rfx_lanes`, `rfx_lane_vendors`, `vendors` y `rate_staging`.
2. **La transacción valida contra esas filas.** `rfx_handoff_commit` exige que el evento exista en `rfx_events` con ese `owner_email`, que cada ruta no desierta tenga un `rfx_lane_vendors` con `award_role='primary'` y `bid_rate` no nulo, y que cada fila nueva de `rate_staging` tenga `all_in_rate` y `carrier_cost_rate` iguales a `rfx_lane_vendors.bid_rate`. Si algo no cuadra, lanza `RFX_HANDOFF_CONFLICT`. Sin esas filas no hay nada contra qué validar y la llamada falla.
3. **La huella es del evento, no de la oferta.** `rfx_handoff_hash` es un MD5 de todo el evento (evento, rutas, participaciones, rubros, carriers y staging enlazado). Sirve como cerca de concurrencia: si algo cambió entre la preparación y el COMMIT, rechaza. No es una huella SHA-256 por versión de oferta, y el recibo no devuelve una huella de la oferta que Fr8Bid pueda comparar (regla I2 de la especificación).
4. **No se puede llamar desde fuera.** Las funciones `rfx_handoff_*` solo tienen `GRANT EXECUTE` a `service_role`. El único camino es la acción `closeout_awarded_rfx_to_rateware` de `rateware-api`, que exige sesión de Supabase Auth de `rateware-prod` con rol Administrador en `app_metadata.roles`.

**Consecuencia, según lo que ya decidiste:** la primera adjudicación se hace con la opción (a). El evento vive en las tablas RFx de `rateware-prod` y Fr8Bid lo opera a través de `rateware-api` y `rfx-bid-api`. La opción (b), Fr8Bid con su propio Supabase, queda para después y necesita un contrato nuevo en Rateware (§5, C1), que exige tu autorización porque toca Rateware.

**Qué protege hoy la opción (a), aunque el modelo sea mutable.** Desde API 702, antes de escribir nada, la preparación compara cada oferta con su snapshot (`requireHandoffParity`); el caso Morgan 1 800 frente a 1 900 produce conflicto sin escrituras. La entrega es una sola transacción con recibo durable por `operation_id`, y el reintento con la misma operación devuelve el recibo original. Lo que no da: versiones inmutables de oferta (I1) ni una huella de oferta en el recibo (I2). Para el MVP eso se cubre leyendo el historial de pujas que ya existe y mostrándolo antes de adjudicar.

---

## 2. Qué existe en Rateware y se reutiliza

Estado: **Existe** (en producción y probado), **Existe sin uso real** (publicado, cero casos reales), **Parcial**.

### 2.1 Entrega a Rateware (paso 9)

| Contrato | Qué hace | Estado | Reutilizar en el MVP |
|---|---|---|---|
| `rateware-api` · `closeout_awarded_rfx_to_rateware` | Entrega las adjudicaciones de un evento: crea o enlaza `rate_staging` en `pending_review`, marca el evento `awarded`, guarda recibo. Solo Administrador | Existe sin uso real: **0 recibos reales** | Sí. Es el paso 9 del MVP tal cual |
| Tabla `rfx_handoff_receipts` | Recibo por `(owner_email, rfx_event_id, operation_id)`; guarda petición, huella antes y después, resultado | Existe sin uso real | Sí. Fr8Bid guarda el `operation_id` y lee el recibo de la respuesta |
| `rfx_handoff_lookup` / `_snapshot` / `_commit` | Búsqueda de recibo, huella del evento, transacción única con bloqueo y `lock_timeout` de 5 s | Existe sin uso real | Indirecto, solo a través de la acción |
| Trigger `rfx_handoff_event_fence` | Toda escritura en rutas, participaciones o rubros bloquea el evento padre | Existe | Sí, sin hacer nada |
| Guardas de cierre (`requireCompleteRfxAwardDecisions`, `requireEligibleRfxCloseout`, `requireHandoffParity`) | Cada ruta decidida; rubro con negativa expresa bloquea; vigencia vencida o carrier bloqueado bloquean al COMMIT; paridad oferta y snapshot | Existe | Sí. Cubren I3 e I4 en el servidor |

**Respuesta que recibe Fr8Bid:** `inserted`, `linked`, `queued_for_review`, `preserved_approved`, `already_staged`, `existing_rate_staging_ids`, `raw_upload_id`, `job_id`, `target_status`, `decisions`, `outcomes` y `receipt_operation_id`. Con eso Fr8Bid sabe qué filas de `rate_staging` corresponden a la adjudicación. No trae huella de la oferta.

**Un detalle para la interfaz:** si el snapshot histórico del carrier ya estaba `approved`, la entrega lo conserva `approved` (`preserved_approved`). En un evento nuevo no pasa, pero la pantalla debe decirlo si ocurre.

### 2.2 Evento, rutas y participaciones (pasos 2, 3, 5 y 7)

| Contrato | Estado | Reutilizar |
|---|---|---|
| `create_rfx_event`, `update_rfx_event`, `import_rfx_lanes`, `update_rfx_lane`, `duplicate_rfx_event` | Existe | Sí. Crear el evento simulado de D5 y el real |
| `list_rfx_events`, `list_rfx_detail`, `list_rfx_event_context`, `list_rfx_segment_confirmations` | Existe; aislamiento 404 probado con otra organización | Sí. Lecturas del comparativo |
| `auto_shortlist_rfx_lane`, `shortlist_rfx_lane_vendors`, `invite_rfx_lane_vendors`, `archive_rfx_lane_vendors` | Existe | Sí. Preselección e invitación (participación carrier × ruta en Rateware; ver §4) |
| `update_rfx_bid`, `reject_rfx_bid` | Existe | Captura del equipo cuando la oferta llega por otro canal |
| Cierre a ofertas: `update_rfx_event` a `closed` | Existe; **solo Administrador** (`ADMIN_STATUSES`) | Sí |
| Proyectos y necesidad: `create_rfx_process_project`, `save_rfx_process_rfi`, `create_rfx_rfi_magic_link`, `create_rfx_demand_snapshot`, `create_rfx_package`, `launch_rfx_package_to_bid_room`, `launch_shipper_opportunity_rfx`, `promote_shipper_rfi_to_opportunity` | Existe | Paso 1. Para el MVP basta `create_rfx_event` directo; el RFI del shipper entra después |

### 2.3 Liga del carrier (`rfx-bid-api`, paso 5)

Sin sesión: el token de invitación es la credencial. Guardado como digest desde `hash_rfx_bid_invitation_tokens`.

| Acción | Para qué | Reutilizar |
|---|---|---|
| `get_invitation`, `peek_invitation` | Ver la invitación; `peek` no registra vista (la usa Loads) | Sí |
| `submit_bid` | Enviar o revisar la oferta con todos los términos estructurados; 409 si el plazo venció | Sí |
| `save_segment_confirmations` | Responder rubros | Sí |
| `decline_invitation`, `withdraw_bid` | Declinar o retirar | Sí |
| `list_bid_room_chat`, `post_bid_room_chat_message`, `bid_support_reply`, `request_lane_access` | Conversación con el equipo | Fuera del MVP |
| `public_bid_room_board`, `public_bid_room_request_invite`, `public_bid_room_find_invitations` | Tablero público | Lo usa Loads |
| `get_customer_rfi`, `save_customer_rfi`, `submit_customer_rfi` | Liga del shipper para su necesidad | Después del MVP |

Fr8Bid puede reutilizar la pantalla de liga que ya tiene Bidware o hacer la suya; el contrato es el mismo.

### 2.4 Adjudicación (paso 8)

| Contrato | Estado | Nota |
|---|---|---|
| `award_rfx_lane_vendor` → RPC `rateware_award_rfx_lane_vendor` | Existe; transaccional, idempotente por `operation_id` (`rfx_award_operations`), solo `service_role` y solo Administrador | Escribe `award_role`, motivo, notas y autor sobre `rfx_lane_vendors`. Exige `bid_rate`; rechaza ruta desierta |
| `clear_rfx_award` | Existe; Administrador | **No es transaccional**: varias escrituras sueltas. Usarlo solo antes de la entrega |
| `set_rfx_lane_no_award` | Existe; Administrador | Ruta desierta con motivo |
| `create_rfx_award_package`, `mark_rfx_award_package_implementation_ready` | Existe; Administrador | Paquete de adjudicación para el shipper. Fuera del MVP |

La adjudicación apunta a la fila de participación, no a una versión de oferta. Si el carrier pudiera revisar la oferta después de adjudicar, la adjudicación tomaría el importe nuevo sin otra decisión (no verifiqué si `submit_bid` lo impide cuando la participación ya está adjudicada). Mitigación para el MVP: cerrar el evento a ofertas antes de adjudicar (la liga devuelve 409) y mostrar el historial; el contrato C2 de §5 lo resuelve de verdad.

### 2.5 Avisos (pasos 4 y 10)

| Contrato | Estado | Reutilizar |
|---|---|---|
| Cola de mensajes: `generate_outreach_drafts`, `list_outreach_messages`, `get_outreach_message`, `send_outreach_messages`, `mark_outreach_messages`, `verify_outreach_gmail_message`, `sync_gmail_bounces` | Existe y probado con envío real único (Q-1006). Guarda `outreach_approval_guard` (API 699+): la aprobación se ata a la versión exacta del contenido | Sí. Invitación y aviso por Gmail |
| `generate_rfx_award_notices` | Existe; Administrador | Genera los borradores de aviso de adjudicación tras el cierre. Se aprueban y envían por la misma Cola |
| Gmail: `check_gmail_connection`, `list_gmail_connections` | Existe; buzón sales@heymarksman.com conectado | Sí |
| WhatsApp: `send_whatsapp_outreach_messages`, plantillas, remitentes | Publicado sin envío real; Meta pide revalidación; parche de teléfono sin publicar | No en el MVP |

### 2.6 Carriers, shippers y tarifas

| Contrato | Estado | Reutilizar |
|---|---|---|
| `list_vendors`, `get_vendor_relationship_activity`, `vendor_intelligence`, `list_vendor_segments`, plantillas de lista de carriers | Existe | Sí, lectura para el paso 3 |
| `list_shippers`, `get_shipper`, `create_shipper` | Existe | Sí. El shipper de prueba de D5 se crea aquí |
| Revisión y Tarifario: `list_staging`, `update_staging` / `bulk_update_staging` a `approved` (solo Administrador) | Existe | Fr8Bid **no** llama a la aprobación (I6). Solo enlaza a la fila en Revisión |
| `bulk_import_upload_template` | Existe; entrada genérica de tarifas a `rate_staging` | **No sirve como entrega**: no tiene recibo por operación, ni enlace al evento, ni validación contra la oferta |

### 2.7 Roles (admin, operator, viewer)

Existe en el servidor desde el Sprint 20 (`_shared/team-roles.ts`). El rol vive en `app_metadata.roles` de Supabase Auth de `rateware-prod` y solo el servidor lo escribe. Solo Administrador: adjudicar, quitar adjudicación, entregar a Rateware, generar avisos de adjudicación, declarar desierta, cerrar o archivar el evento y aprobar tarifas. Operador hace el resto del trabajo diario. Consulta solo lee. Una cuenta de organización sin rol queda como Consulta.

Fr8Bid lo reutiliza sin cambios: inicia sesión con el mismo Supabase Auth (Google) que Bidware y manda el token a `rateware-api`. La interfaz oculta lo que el rol no permite; el servidor responde 403 si se intenta igual.

### 2.8 QuoteDesk

`quotedesk-api` tiene cotizaciones Spot, cola y `convert_spot_request` (transacción `quotedesk_convert_spot_request`, Operador o más, 404/409/422 explícitos). Es una entrada posible de necesidad (paso 1, origen `quotedesk`) y el canal de cotización al cliente, no parte del RFx. Fuera del MVP; se nombra para no reconstruirlo.

---

## 3. Loads

| Contrato | Qué da | Estado |
|---|---|---|
| `rateware.public-board.v1` (schema en `packages/shared-contracts`) | Tablero público de oportunidades desde `public_bid_room_board`. `boardStatus` admite `awarded`, pero sin identidad de carrier (`carrierIdentityVisible: false`) | Existe; Loads es prototipo NO-GO |
| Libro privado del carrier (`private-book-projection.mjs` sobre `get_invitation` / `peek_invitation`) | Las invitaciones del carrier con su propia oferta y su `business_status`, que ya incluye `awarded`, `backup`, `not_awarded` y `closed` | Existe en código local; lee directamente las tablas RFx de Rateware |
| `shipment.created` (ADR-0023) | Evento de embarque hacia Rateware desde Fleet Rocket | Existe; no es del recorrido RFx |
| Proyección «oportunidad adjudicada» (`loads.awarded-opportunity.v1`) | Un registro por adjudicación con recibo, publicado tras la entrega | **Falta** |

**Lo que esto significa para el MVP.** Con la opción (a), el carrier ganador ya ve «adjudicado» en su libro privado de Loads en cuanto el evento está en Rateware, porque Loads lee las mismas filas. El paso 11 del MVP se cumple sin contrato nuevo, siempre que Loads esté publicado para ese carrier. Pero, por lo que muestra la proyección, lo vería en cuanto el Administrador adjudica, **antes** del recibo, lo que contradice D3/I8 (falta confirmar cómo calcula Rateware `business_status` en `get_invitation`). Dos salidas: (1) que Loads muestre «adjudicado» solo si la participación tiene `rateware_closeout_at`, un cambio de una línea en `private-book-projection.mjs`; o (2) el contrato C4 de §5. Recomiendo (1) para el MVP.

---

## 4. Diferencias entre la especificación y lo que existe

| Regla o decisión de `recorrido-rfx-v0` | Lo que hace Rateware hoy | Efecto en el MVP con (a) |
|---|---|---|
| I1 versiones inmutables | La oferta vive en columnas de `rfx_lane_vendors`; el historial está en `rfx_bid_rate_history` y en snapshots de `rate_staging` | Se acepta; se muestra el historial antes de adjudicar |
| I2 huella de oferta en el recibo | Huella MD5 del evento completo, no de la oferta; paridad oferta y snapshot validada antes de escribir | Protege contra el caso Morgan; no da huella eco por oferta |
| I3 / I4 elegibilidad y forma | Implementadas en servidor (vigencia, rubro negativo, carrier bloqueado, primario por ruta, respaldo con primario) | Cumplido |
| I5 entrega idempotente | Implementada (`rfx_handoff_receipts`) | Cumplido |
| I6 nunca aprueba sola | `target_status` fijo en `pending_review`, salvo snapshot ya `approved` | Cumplido, con la nota de §2.1 |
| I7 avisos con aprobación exacta | `outreach_approval_guard` | Cumplido |
| I8 aviso y Loads tras recibo | `generate_rfx_award_notices` va tras el cierre; Loads no espera el recibo | Requiere el cambio de Loads de §3 |
| D2 participación carrier × evento | Rateware es carrier × ruta (`rfx_lane_vendors`) | Con una ruta da igual |
| D4 vigencia ausente con confirmación | Rateware no la bloquea ni pide confirmación | La confirmación la pide la interfaz de Fr8Bid |
| I12 HDships protegido | El evento sigue en las mismas tablas | Fr8Bid no lo lista ni lo toca: filtro explícito por id |

---

## 5. Contratos que faltan

En orden de necesidad. Ninguno bloquea la primera adjudicación con (a), salvo el cambio de Loads si quieres que el carrier vea la adjudicación en Loads solo después del recibo.

| # | Contrato | Para qué | Dónde | Bloquea |
|---|---|---|---|---|
| L1 | Loads muestra `awarded` solo con `rateware_closeout_at` | Cumplir D3/I8 en Loads | `marksman-loads`, una condición en `private-book-projection.mjs` | El paso 11 tal como lo pide D3 |
| C1 | `rfx_external_handoff`: entrada de adjudicación externa con payload (evento, ruta, carrier, versión de oferta, términos completos, huella SHA-256), recibo por `operation_id` y eco de la huella | Hacer posible la opción (b) | Rateware: migración nueva y acción nueva, solo Administrador | La migración a (b) |
| C2 | Adjudicación atada a versión: `award_rfx_lane_vendor` recibe la revisión esperada (`updated_at` o id de historial) y rechaza si cambió | Que una revisión posterior no cambie el importe adjudicado sin otra decisión | Rateware | Nada del MVP si se cierra a ofertas antes de adjudicar |
| C3 | `clear_rfx_award` transaccional | Quitar una adjudicación sin estados a medias | Rateware | Nada, salvo que haya que anular |
| C4 | `loads.awarded-opportunity.v1`: proyección empujada tras el recibo | Loads sin leer tablas RFx directamente; necesaria con (b) | Rateware o Fr8Bid → Loads | La migración a (b) |

C1 a C3 tocan Rateware y necesitan tu autorización expresa, cada uno por separado.

---

## 6. Rebanada mínima con lo que existe (opción a)

Todo sobre `rateware-api` y `rfx-bid-api`, sin migraciones. Cada paso que escribe en producción necesita tu aprobación por acción (D5).

1. `create_shipper` (shipper de prueba) y `create_rfx_event` + `import_rfx_lanes` («PRUEBA CONTROLADA», Monterrey → Dallas, Dry Van).
2. `shortlist_rfx_lane_vendors` + `invite_rfx_lane_vendors` con dos o tres carriers de prueba cuyo buzón es sales@.
3. Invitación por Cola: `generate_outreach_drafts` → aprobación → `send_outreach_messages`.
4. Carriers envían por liga: `submit_bid` (versión 1 y versión 2 para ver el historial).
5. `update_rfx_event` a `closed` (Administrador).
6. `award_rfx_lane_vendor` primario (Administrador, confirmando vigencia ausente si aplica).
7. `closeout_awarded_rfx_to_rateware` con un `operation_id` generado una vez → recibo; la tarifa queda `pending_review` en Revisión.
8. `generate_rfx_award_notices` → aprobación del contenido exacto → `send_outreach_messages`.
9. El carrier ganador ve «adjudicado» en su libro de Loads (tras L1, solo con recibo).

Pruebas automáticas: contra Rateware simulado. Los contratos de Rateware ya tienen sus pruebas en laboratorio; Fr8Bid prueba su recorrido (§9 de la especificación) con respuestas simuladas de esas acciones.

---

## 7. Qué decisión se necesita

Ninguna para seguir con conceptos y wireframes: D1 queda en (a) para la primera adjudicación, como acordaste. Lo que vas a tener que decidir más adelante, cada cosa por separado:

1. **L1 en Loads** antes del primer recorrido, si quieres que el carrier vea la adjudicación solo después del recibo. Es un cambio fuera de Fr8Bid.
2. **C1 y C2 en Rateware** cuando quieras pasar a (b). Son migraciones en `rateware-prod`.
3. **Confirmar el handoff contra Rateware main `b11991f8`** antes de programar sobre él. Leerlo requiere un checkout reciente de Rateware o permiso para consultar GitHub.

---

## 8. Confirmación contra Rateware main `b11991f8` (21/oct/2026)

Leído con `gh api` en modo consulta, sin checkout ni escrituras. `main` = `b11991f8`.

- `supabase/migrations/20261018030000_rfx_handoff_atomic.sql` es **idéntica** a la copia del Sprint 19 (sin contar finales de línea).
- `closeoutAwardedRfxToRateware` en `rateware-api/index.ts` es idéntica, igual que `handoff-contract.mjs`, `handoff-plan.ts` y `rfx-closeout-guards.ts`. Lo dicho en §1 y §2.1 sigue vigente.
- Hallazgo nuevo que cambia el código: el despachador de `rateware-api` solo respeta un `operation_id` que cumpla `UUID_PATTERN` con **versión 1–5 y variante 8–b**; cualquier otro lo sustituye por uno aleatorio y se pierde la idempotencia del reintento. Fr8Bid genera ids con versión 5 y el proxy rechaza los demás.
- Duda de §2.4 resuelta: `submit_bid` de `rfx-bid-api` responde 409 si el evento está `closed`, `awarded` o `archived`, si venció el plazo **o si la participación ya tiene `award_role`**. La liga no puede cambiar el importe adjudicado; solo la captura del equipo (`update_rfx_bid`) podría.
- Ojo: `list_rfx_detail` no es de solo lectura en eventos abiertos (repara cobertura de participaciones) y devuelve las ligas privadas de cada carrier. Fr8Bid quita los tokens en el proxy.
- No existe acción que devuelva el historial de versiones de una oferta. Con Rateware real la Mesa solo ve la versión vigente; el historial que muestra el modo simulado depende de C2.

## 9. Desajustes del modo rateware corregidos (21/oct/2026)

Leído en el `rateware-api` y `rfx-bid-api` del paquete del Sprint 19 y del worktree local (las acciones no relacionadas con el handoff no se compararon contra `b11991f8`).

- **`update_rfx_event` con `status: "closed"` no es el cierre a ofertas.** Exige todas las rutas decididas, ejecuta `closeoutAwardedRfxToRateware` sin el `operation_id` de Fr8Bid y genera los avisos de adjudicación. Fr8Bid ya no lo manda nunca (el proxy responde 409 `CIERRE_POR_ENTREGA`). El cierre a ofertas es mover `due_date` a ayer: `rfx-bid-api` cierra la liga al terminar ese día y el evento sigue `open` hasta la entrega. La Mesa muestra «cerrado a ofertas» cuando el evento está `open` con el plazo vencido. Adjudicar no exige que el evento esté cerrado en Rateware; la exigencia (I3) es de Fr8Bid.
- `update_rfx_event` lee el cambio de `body.patch`; antes se mandaba al nivel raíz y Rateware lo ignoraba.
- `import_rfx_lanes` recibe `rows`; `shortlist_rfx_lane_vendors` recibe `lane_id`; la participación nace `drafted`.
- Los rubros no vienen en `list_rfx_detail`: se leen con `list_rfx_segment_confirmations` (`rubric_key`, `answer` = `pending · agree · exception · disagree · not_applicable`). `disagree` es la negativa expresa.
- `update_outreach_message` no existe; la Cola aprueba con `mark_outreach_messages` (`ids`) y envía con `expected_versions`. La preparación del evento, la Cola y la liga del carrier quedan como **solo simulado** (501 `PASO_EN_RATEWARE` contra Rateware real) y se hacen en las pantallas de Rateware hasta alinearlas una por una. Contra Rateware real, Fr8Bid lee, cierra a ofertas, adjudica, entrega con `operation_id` y genera los borradores de aviso.
- Visto contra `rateware-prod` el 21/oct: `list_rfx_events` responde `{ rows }` (no `events`) y trae `lane_count`, `invitation_count` y `bid_count`, sin vista previa de rutas. `update_rfx_bid` recibe `{ id, patch }` (id de `rfx_lane_vendors`; `patch` con `bid_rate`, `currency`, `valid_through`, `commercial_model`, `capture_source: "manual_operator"`…). Visto el 22/oct: con otro nombre de campo responde 200, no guarda la tarifa y deja la participación en `drafted`. `list_rfx_detail` recibe `event_id`. Las funciones `/api` en Vercel necesitan imports relativos con `.js` (Node ESM).
- 22/oct, tras el recorrido de prueba contra `rateware-prod`: la Mesa ya publica el evento (`update_rfx_event` con `patch.status: "open"`), marca participaciones como invitadas sin enviar (`invite_rfx_lane_vendors` con `ids`, `confirmed: true`, `confirmation_action`) y captura ofertas del equipo (`update_rfx_bid` con `{ id, patch }`, `capture_source: "manual_operator"`). El proxy exige `event_id` en las dos últimas y comprueba con una lectura fresca que cada id es de ese evento.
