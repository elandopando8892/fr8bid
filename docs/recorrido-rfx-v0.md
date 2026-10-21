# Recorrido y modelo de datos del evento RFx · v0

Fr8Bid, Bid Room de MARKSMAN. Primer entregable del mandato, parte 1: especificación del recorrido y del modelo de datos, con estados explícitos, trazabilidad y reglas de integridad. El inventario detallado de contratos con Rateware y Loads va en `docs/contratos-rateware-loads-v0.md` (otro hilo); aquí solo se nombra el contrato que cada paso necesita.

Fuentes leídas en modo consulta: `bidware-contexto` completo (LEEME, conciliación 18/oct, cierres Sprint 19 y 20, revisión HDships, plan de salida, piloto 22, README de Rateware y Loads), migraciones RFx de Rateware en el worktree `radar-rfi-git-close-20261015`, documentos de Bidware sobre entrega atómica, versión aprobada de correo, historial de ofertas, respaldo y desierto, resultado en revisión y estados de WhatsApp, y los ADR 0008, 0022 y 0023 de Loads. No se ejecutó nada contra producción.

---

## 1. Qué había y qué se aprende de ello

El backend actual (Rateware, Supabase `rateware-prod`) ya resuelve buena parte del recorrido, pero su modelo nació mutable y se fue endureciendo por parches. Las lecciones que este diseño incorpora desde el origen:

| Hallazgo en lo existente | Causa de fondo | Cómo lo evita este modelo |
|---|---|---|
| H1: la oferta de Morgan dice 1 800 y su snapshot en `rate_staging` dice 1 900 | La oferta vive en columnas mutables de `rfx_lane_vendors` y el snapshot se copia aparte en otro momento | La oferta es una **versión inmutable** con huella de contenido. No hay segundo snapshot que pueda divergir: lo que se entrega se deriva de la versión adjudicada y lleva su huella |
| H2: la rama sin snapshot perdía vigencia, porcentajes, fee y redondeo | El mapeo a Rateware elegía campos a mano | Todos los términos comerciales forman parte del contenido versionado y de la huella; un campo que no viaja hace fallar la verificación |
| R1: cierre en varias escrituras separadas, duplicados posibles | Sin transacción ni recibo | Entrega con `operation_id`, huella del payload y recibo durable; ya existe en Rateware (`rfx_handoff_atomic`, API 702+) y se reutiliza |
| Nexos 1 650 frente a 1 700 sin atribución | Revisiones del portal sin actor ni motivo claros | Cada versión registra fuente, actor (o canal del token) y momento; la UI muestra el historial completo antes de decidir |
| Correo enviado con una versión distinta a la aprobada | Aprobación sin atadura al contenido | La aprobación de un aviso se ata a la huella exacta del contenido; cualquier edición la invalida |
| Tokens de invitación en claro | Diseño temprano | Solo se guarda digest (y cifrado para reenvío), como en `hash_rfx_bid_invitation_tokens` |
| Leyenda «Todos los rubros de acuerdo» con 2/6 | Estado derivado mal nombrado | Los rubros tienen estado por rubro y el agregado se calcula, no se escribe |

Lo que se conserva como regla de negocio vigente: rubros faltantes son aviso, una negativa expresa bloquea; oferta vencida no se adjudica; la tarifa entra a Rateware siempre como `pending_review` y nunca se aprueba sola; respaldo requiere primario; una ruta puede declararse desierta con motivo interno.

---

## 2. El recorrido

Actores: **Administrador** (decide, adjudica, aprueba avisos), **Operador** (prepara, invita, captura ofertas recibidas por otro canal; no adjudica), **Consulta** (solo lee), **Carrier** (responde por liga privada), **Shipper** (origen de la necesidad). Roles iguales a los que ya aplica el servidor de Rateware (admin, operator, viewer).

| # | Paso | Quién | Entra | Sale | Contrato externo |
|---|---|---|---|---|---|
| 1 | Registrar la necesidad | Operador / Shipper por liga | Correo, RFI, QuoteDesk o captura manual | `necesidad` con rutas, volumen, objetivo y fechas | Shipper CRM (lectura) |
| 2 | Diseñar el evento | Operador | Necesidad | `evento` en borrador con `ruta`s, plazo, visibilidad, rubros | — |
| 3 | Elegir carriers | Operador | Carrier CRM, plantillas de lista, Carrier Fit | `participación`es preseleccionadas | Carrier CRM / `vendors` (lectura) |
| 4 | Publicar e invitar | Administrador aprueba el aviso | Evento listo | Evento abierto; `aviso` de invitación por carrier, cada uno aprobado y con recibo | Gmail conectado (primero) |
| 5 | Recibir ofertas | Carrier por liga privada; Operador si llega por otro canal | Invitación vigente | `oferta_version`es inmutables por ruta | — |
| 6 | Comparar | Administrador / Operador | Versiones vigentes | Tabla comparable: all-in, moneda, modelo comercial, capacidad, tránsito, vigencia, rubros | — |
| 7 | Cerrar a ofertas | Plazo o Administrador | Evento abierto | Evento cerrado a ofertas; ya no se aceptan versiones | — |
| 8 | Adjudicar | **Solo Administrador, decisión humana** | Comparativo | `adjudicación` por ruta (primario, respaldo opcional) o ruta desierta, atada a una versión exacta | — |
| 9 | Entregar a Rateware | Administrador confirma | Adjudicaciones completas | `entrega` con recibo idempotente; tarifa `pending_review` en Rateware | `rfx_handoff_atomic` / `rateware-api` |
| 10 | Avisar al carrier | Administrador aprueba el contenido exacto | Entrega confirmada | `aviso` de adjudicación con recibo del proveedor | Gmail; WhatsApp cuando Meta lo permita |
| 11 | Publicar en Loads | Automático tras recibo | Entrega confirmada | Oportunidad adjudicada visible para el carrier ganador | Contrato Loads (falta, ver §7) |

Rebanada más delgada (MVP): una necesidad real, un evento, **una ruta**, de dos a cinco carriers, un primario sin respaldo, una entrega con recibo en Rateware, un aviso por Gmail y la oportunidad visible en Loads. Todo lo demás (respaldo, desierta, varias rutas, WhatsApp) cabe en el modelo pero no se construye primero.

---

## 3. Modelo de datos

Modelo lógico. Dónde vive físicamente (tablas propias de Fr8Bid o las de Rateware) es la decisión D1 de §8; el modelo y sus reglas no cambian con esa decisión.

```
necesidad 1─┐
            └─n evento 1─n ruta
                  │          │
                  1          │
                  n          │
             participación 1─n oferta_version n─1 ruta
                                   │
                                   1 (exacta)
                                   │
                            adjudicación n─1 ruta
                                   │ n
                                   1
                                entrega ──► recibo Rateware
                                   │
                    aviso (invitación | adjudicación | no adjudicación)
                                   │
                         publicación_loads
        bitácora (append-only) ◄── todas las transiciones
```

### 3.1 `necesidad`
Lo que el shipper pide, antes de convertirlo en evento.

| Campo | Tipo | Nota |
|---|---|---|
| id | uuid | |
| organizacion_id | text | Tenencia; toda lectura filtra por aquí |
| shipper_id | uuid | Shipper CRM |
| origen | enum `rfi_liga · quotedesk · correo · manual` | Procedencia |
| origen_ref | text | Id de RFI, cotización o mensaje |
| tipo | enum `spot · mini_bid · programa` | Mapea a `event_type` de Rateware |
| rutas_solicitadas | jsonb | Origen, destino, equipo, operación, servicio, cruce, volumen semanal, objetivo y moneda |
| arranque_estimado, fecha_limite | date | |
| estado | enum `recibida · en_diseño · convertida · descartada` | |
| creada_por, creada_en | | |

### 3.2 `evento`
| Campo | Tipo | Nota |
|---|---|---|
| id, folio | uuid, text | Folio legible `RFX-####-XXXX` |
| organizacion_id, necesidad_id, shipper_id | | |
| tipo | enum `spot · mini_bid · programa` | |
| visibilidad | enum `privado · ranking_anonimo · tablero_abierto` | Igual a `bid_visibility_mode` |
| plazo_ofertas | timestamptz | Con zona America/Mexico_City explícita |
| arranque_estimado | date | Visible al carrier |
| rubros | jsonb | Lista versionada de rubros que el carrier confirma (modelo logístico, criterios de operación, reglas de negocio, especificaciones, requisitos de carrier, otras notas) |
| estado | ver §4.1 | |
| version | bigint | Concurrencia optimista en cada cambio de estado |

### 3.3 `ruta`
| Campo | Tipo | Nota |
|---|---|---|
| id, evento_id, numero | | |
| origen, destino | estructura | MX: ciudad + estado. US/CA: KMA y/o ZIP3. País siempre explícito |
| cruce | código de catálogo o nulo | Solo declarado, nunca inferido (lección ADR-0022) |
| equipo, remolque, configuración, operación, servicio | código de catálogo | `rateware_catalog_items` |
| volumen_semanal, objetivo, moneda | numeric, numeric, char(3) | |
| estado | ver §4.2 | `abierta · adjudicada · desierta` |
| desierta_motivo, desierta_por, desierta_en | | Motivo interno, nunca viaja al aviso |

### 3.4 `participación`
Un carrier invitado a un evento. Una por carrier y evento (D2 en §8 discute la alternativa carrier × ruta que usa Rateware).

| Campo | Tipo | Nota |
|---|---|---|
| id, evento_id, carrier_id | | `carrier_id` = `vendors.id` |
| token_digest, token_cifrado | text | Nunca el token en claro |
| canal_invitación | enum `gmail · whatsapp · manual` | |
| invitada_en, vista_en, respondió_en, declinó_en | timestamptz | Hitos |
| rubros_respuesta | jsonb por rubro | `de_acuerdo · excepción · no_puedo · no_aplica · sin_respuesta` |
| estado | ver §4.3 | |

### 3.5 `oferta_version` (el corazón de la integridad)
Cada envío o corrección de una oferta crea una fila nueva. **Ninguna fila se actualiza jamás.**

| Campo | Tipo | Nota |
|---|---|---|
| id | uuid | |
| participación_id, ruta_id | | |
| numero | int | 1, 2, 3… por participación y ruta |
| anterior_id | uuid nulo | Cadena de revisiones |
| tarifa_all_in, moneda | numeric, char(3) | |
| modelo_comercial | enum `fee_plus · cost_plus · sell_share · brokerage` | Canónico de Rateware |
| carrier_share_pct, margen_pct, fee_cliente, incremento_redondeo | numeric nulos | Campos estructurados, nunca en nota |
| capacidad_semanal, transito_dias | numeric nulos | |
| vigente_hasta | date nulo | |
| equipo_alternativo, ubicación_unidad, vacío_distancia, vacío_unidad, cuenta_espejo | | Opcionales, igual que hoy |
| es_final | bool | «Best and final» declarado |
| fuente | enum `portal_carrier · captura_equipo · importación` | |
| actor | text | Usuario del equipo o `token:<participación>` |
| nota | text | Sin valor comercial |
| huella | text | SHA-256 de la forma canónica de todos los campos comerciales anteriores (lista cerrada, orden fijo, números normalizados) |
| creada_en | timestamptz | |

La **versión vigente** de una participación en una ruta es la de mayor `numero` que no esté retirada. Se calcula; no se guarda en otra columna mutable.

### 3.6 `adjudicación`
Decisión humana. Inmutable salvo su anulación explícita antes de entregarse.

| Campo | Tipo | Nota |
|---|---|---|
| id, evento_id, ruta_id | | |
| oferta_version_id | uuid | La versión exacta que se adjudicó |
| huella_oferta | text | Copia de `oferta_version.huella` en el momento de decidir |
| rol | enum `primario · respaldo` | |
| motivo, notas | text | |
| decidida_por, decidida_en | | Solo rol Administrador |
| operation_id | uuid | Idempotencia de la decisión (patrón `rfx_award_operations`) |
| estado | ver §4.4 | `vigente · anulada · entregada` |
| anulada_por, anulada_en, anulada_motivo | | |

### 3.7 `entrega` (handoff a Rateware)
| Campo | Tipo | Nota |
|---|---|---|
| id, evento_id | | Una entrega cubre todas las rutas decididas del evento |
| operation_id | uuid | Generado una vez, reutilizado en cada reintento |
| payload | jsonb | Derivado puro de adjudicaciones + versiones; incluye cada `huella_oferta` |
| huella_payload | text | SHA-256 del payload canónico |
| estado | ver §4.5 | |
| recibo | jsonb | Respuesta de Rateware: ids de `rate_staging`, estado `pending_review`, huella eco, momento |
| intentos | int | Solo manuales |
| solicitada_por, solicitada_en, confirmada_en | | |

### 3.8 `aviso`
Toda comunicación saliente, del tipo que sea.

| Campo | Tipo | Nota |
|---|---|---|
| id, evento_id, participación_id | | |
| tipo | enum `invitación · adjudicación · respaldo · no_adjudicado · recordatorio` | |
| canal | enum `gmail · whatsapp` | |
| destinatario | text | Correo o teléfono verificado del carrier |
| contenido | jsonb | Asunto, cuerpo, idioma, plantilla |
| huella_contenido | text | |
| aprobado_por, aprobado_en, aprobación_vence | | La aprobación es de esta huella |
| operation_id | uuid | Reserva idempotente |
| recibo_proveedor | jsonb | Id de mensaje Gmail o WAMID, respuesta cruda saneada |
| estado | ver §4.6 | |

### 3.9 `publicación_loads`
| Campo | Tipo | Nota |
|---|---|---|
| id, evento_id, ruta_id, adjudicación_id | | |
| proyección | jsonb | Solo campos seguros para el carrier: folio, ruta, equipo, operación, arranque, rol, tarifa acordada |
| version_contrato | text | p. ej. `loads.awarded-opportunity.v1` |
| estado | `pendiente · publicada · retirada · fallida` | |
| recibo | jsonb | |

### 3.10 `bitácora`
Append-only, una fila por transición de cualquier entidad: `entidad, entidad_id, de_estado, a_estado, actor, rol, operation_id, huella_antes, huella_después, momento, detalle`. Sin borrado ni actualización (trigger de rechazo). Es la fuente de la trazabilidad de §5.

---

## 4. Estados

Reglas comunes: cada transición la hace una sola función de servidor, dentro de una transacción, con comprobación de rol y de organización, y escribe su fila de bitácora en la misma transacción. Un estado no listado como destino no se alcanza.

### 4.1 Evento
```
borrador ──publicar──► abierto ──plazo o cierre manual──► cerrado_a_ofertas
   │                     │                                    │
   └──cancelar──► cancelado ◄──cancelar──┘                    ▼
                                                     en_decisión (≥1 ruta decidida)
                                                              │ todas las rutas adjudicadas o desiertas
                                                              ▼
                                                         decidido ──entrega confirmada──► entregado ──► archivado
```
- `abierto → cerrado_a_ofertas` ocurre solo por el reloj del servidor o por el Administrador. Reabrir es una transición explícita `cerrado_a_ofertas → abierto` con motivo, solo si no hay adjudicaciones vigentes.
- `decidido → en_decisión` si se anula una adjudicación antes de entregar.
- `entregado` exige recibo confirmado; nunca se marca por la interfaz.

### 4.2 Ruta
`abierta → adjudicada` (tiene primario vigente) · `abierta → desierta` (motivo obligatorio, sin adjudicaciones vigentes) · ambas vuelven a `abierta` solo antes de la entrega.

### 4.3 Participación
```
preseleccionada ──aviso de invitación aceptado──► invitada ──abre liga──► vista ──primera versión──► respondió
        │                                             │                     │
        └──excluir──► excluida                        └──────declina────────┴──► declinó
                                       respondió ──retira todas sus versiones──► retirada
```
Cuando el evento pasa a `cerrado_a_ofertas`, la liga deja de aceptar versiones (respuesta 409 «plazo vencido», como hoy).

### 4.4 Adjudicación
`vigente → entregada` (cuando su entrega confirma) · `vigente → anulada` (Administrador, motivo, antes de entregar). Una adjudicación entregada no se anula: corregirla es un caso nuevo en Rateware, fuera del MVP.

### 4.5 Entrega
```
preparada (payload y huella calculados, cero escrituras externas)
   │ Administrador confirma
   ▼
enviada ──recibo con huella eco igual──► confirmada
   │ ──rechazo de validación o conflicto 409──► rechazada (se puede preparar otra con otra operation_id tras corregir la causa)
   │ ──sin respuesta / timeout──► incierta ──reintento con la MISMA operation_id──► confirmada | rechazada
```
No hay reintento automático. `incierta` bloquea preparar otra entrega para el evento hasta conciliarla.

### 4.6 Aviso
```
borrador ──aprobar (huella exacta)──► aprobado ──reservar──► reservado ──proveedor acepta──► aceptado ──► entregado ──► leído ──► respondido
   ▲              │ edición del contenido                │                       │
   └──────────────┘ invalida la aprobación              │                       └──► rebotado / fallido
                         aprobado ──vence──► vencido    └──sin respuesta──► incierto ──conciliar──► aceptado | fallido
```
`entregado`, `leído` y `respondido` solo existen en WhatsApp; Gmail llega hasta `aceptado` más rebote si lo hay. Un aviso `incierto` nunca se reenvía solo.

### 4.7 Publicación en Loads
`pendiente → publicada` (recibo de Loads) · `pendiente → fallida` (reintento idempotente manual) · `publicada → retirada` (evento cancelado o corrección futura).

---

## 5. Trazabilidad

Cadena completa, consultable desde cualquier eslabón:

`necesidad.id → evento.id/folio → ruta.id → participación.id → oferta_version.id + huella → adjudicación.id + operation_id → entrega.operation_id + huella_payload → recibo.rate_staging_id (Rateware) → aviso.id + recibo_proveedor (Gmail message id) → publicación_loads.id + recibo`

Preguntas que el sistema responde sin abrir la base a mano:
1. ¿Qué importe exacto aceptó el Administrador y qué decía la oferta en ese momento? (adjudicación → versión → huella)
2. ¿La tarifa en `pending_review` de Rateware es la misma oferta? (recibo con huella eco = huella_oferta)
3. ¿Quién cambió la oferta de 1 650 a 1 700, por qué canal y cuándo? (cadena de versiones con fuente y actor)
4. ¿Qué texto exacto recibió el carrier y quién lo aprobó? (aviso → huella_contenido → aprobado_por)
5. ¿Qué ve el carrier en Loads y desde cuándo? (publicación → proyección → recibo)

---

## 6. Reglas de integridad

Cada regla es comprobable con una prueba del recorrido (§9).

**I1. Versiones inmutables.** `oferta_version` solo admite INSERT. Un UPDATE o DELETE lo rechaza un trigger. Corregir una oferta es crear la versión siguiente.

**I2. La oferta y lo entregado nunca difieren sin decisión humana.** No existe snapshot paralelo. El payload de la entrega se construye exclusivamente desde `adjudicación → oferta_version`. Al confirmar, Rateware devuelve la huella de lo que guardó; si no coincide con `huella_oferta`, la entrega queda `rechazada` y no se escribe nada (Rateware ya rechaza discrepancias desde API 702, `RFX_HANDOFF_CONFLICT`). Si aparece una versión nueva después de adjudicar, la adjudicación vigente sigue apuntando a la versión anterior y la interfaz lo señala como «hay una versión más reciente»; cambiar a la nueva exige anular y adjudicar de nuevo, es decir, otra decisión humana.

**I3. Solo se adjudica lo que se puede.** Crear una adjudicación exige: evento `cerrado_a_ofertas` o `en_decisión`; versión vigente de esa participación y ruta; `huella_oferta` igual a la de la versión; `vigente_hasta` nulo o ≥ hoy (fecha de México); ningún rubro en `no_puedo`; carrier no bloqueado en CRM; rol Administrador.

**I4. Forma de la decisión por ruta.** A lo más un primario vigente; respaldo solo si hay primario; ruta desierta sin adjudicaciones vigentes; el primario y el respaldo son de participaciones distintas.

**I5. Entrega única e idempotente.** Una entrega `confirmada` por evento. El mismo `operation_id` con el mismo payload devuelve el recibo original; con payload distinto, error. Dos `operation_id` distintos que compiten: uno confirma, el otro recibe 409.

**I6. Rateware nunca aprueba sola.** Todo lo entregado llega como `pending_review` con resultado `awarded` o `backup`. Fr8Bid no tiene acción para aprobar tarifas al Tarifario.

**I7. Avisos solo con aprobación exacta.** Se envía únicamente un aviso `aprobado` cuya `huella_contenido` coincide con la reservada. Editar invalida. Sin reintento automático; `incierto` se concilia antes de cualquier otro intento.

**I8. Orden del recorrido.** El aviso de adjudicación y la publicación en Loads requieren la entrega `confirmada`. El carrier no se entera de una adjudicación que Rateware no tiene.

**I9. Tenencia.** Toda lectura y escritura filtra por organización dentro de la función de servidor; un recurso ajeno responde 404 sin detalles (comportamiento ya probado en Rateware).

**I10. Ligas como credencial.** Token de invitación guardado como digest más cifrado; caduca con el plazo del evento; solo permite crear versiones de su propia participación.

**I11. Bitácora completa.** Ninguna transición sin su fila de bitácora en la misma transacción. La bitácora no se edita.

**I12. Eventos protegidos.** El evento HDships (`5894a5f1-…`, 298 participaciones, 5 ofertas, 0 adjudicaciones, discrepancia 1 800 frente a 1 900) queda fuera de cualquier migración, prueba o importación hasta decisión del propietario.

---

## 7. Contratos que necesita cada paso (resumen; detalle en el otro hilo)

| Paso | Contrato | Estado según lo leído |
|---|---|---|
| Carriers y shippers | Lectura de `vendors` y `shippers` en Rateware | Existe |
| Invitación y aviso Gmail | Cola con aprobación por versión y recibo (`outreach_approval_guard`, API 699+) | Existe y probado; ataca tablas de Rateware |
| Aviso WhatsApp | Meta Cloud API vía Rateware | Publicado técnicamente, sin envío real; Meta pide revalidación |
| Adjudicación | `rateware_award_rfx_lane_vendor` con recibos | Existe; opera sobre `rfx_lane_vendors` mutable |
| Entrega con recibo | `rfx_handoff_atomic` + `closeoutAwardedRfxToRateware` (API 702+) | Existe en Rateware main, 0 recibos reales. No está en el worktree local consultado (base 59337fab, anterior a la migración) |
| Oportunidad adjudicada en Loads | Proyección `rfx.awarded` hacia Loads | **Falta.** Loads solo tiene `rateware.public-board.v1` (oportunidades abiertas) y `shipment.created` |

---

## 8. Decisiones que necesita el propietario

**D1. Dónde vive la verdad del evento.**
(a) Reutilizar las tablas RFx de `rateware-prod` como hace Bidware: el recibo en Rateware sale con contratos que ya existen, pero el modelo mutable sigue ahí y la inmutabilidad de versiones exigiría migrar esas tablas.
(b) Fr8Bid con su propio Supabase y este modelo tal cual, y Rateware recibe solo la adjudicación por un contrato de entrada: el modelo nace limpio, pero falta ese contrato en Rateware (y tocar Rateware requiere tu autorización).
Recomendación provisional: decidir con el inventario del otro hilo a la vista; si `rfx_handoff_atomic` puede recibir un payload externo con huella sin depender de `rfx_lane_vendors`, (b) es la opción sana. Si no, (a) para la primera adjudicación y (b) después.

**D2. Granularidad de la participación.** Propuesta: carrier × evento (una liga por carrier, ofertas por ruta). Rateware usa carrier × ruta. Con una sola ruta da igual; importa en programas de muchas rutas.

**D3. Aviso solo después del recibo (regla I8).** Recomendado. La alternativa es avisar al adjudicar y entregar después, más rápido pero puede prometer algo que Rateware rechace.

**D4. Vigencia ausente.** Hoy es aviso. Propuesta: mantener aviso en el MVP y exigir confirmación explícita del Administrador al adjudicar una oferta sin vigencia.

**D5. Primer evento real.** Shipper y necesidad que designes para la primera adjudicación. HDships no, salvo que lo decidas.

---

### Decisiones tomadas (20/oct/2026, Jose: «vamos con tu recomendación»)

- **D1:** si el inventario de contratos confirma que `rfx_handoff_atomic` puede recibir un payload externo con huella sin depender de `rfx_lane_vendors`, Fr8Bid tiene su propio Supabase con este modelo (b). Si no, la primera adjudicación usa las tablas de `rateware-prod` (a) y después se migra a (b). Lo resuelve `docs/contratos-rateware-loads-v0.md`.
- **D2:** participación carrier × evento.
- **D3:** el aviso de adjudicación sale solo después del recibo de Rateware (regla I8).
- **D4:** la vigencia ausente sigue como aviso; para adjudicar, el Administrador la confirma explícitamente.
- **D5:** el primer recorrido se hace con un **evento simulado** (Jose, 20/oct). Shipper de prueba, una ruta (por ejemplo Monterrey → Dallas, Dry Van), dos o tres carriers de prueba cuyo buzón es sales@heymarksman.com, etiqueta «PRUEBA CONTROLADA» en el nombre y en las notas, y ofertas sin valor comercial. Las pruebas automáticas usan Rateware simulado. Una entrega a Rateware real con este evento, aunque sea simulado, crea una tarifa `pending_review` en producción, así que requiere la aprobación del propietario para esa acción concreta. Según el mandato, el MVP solo se declara terminado con un evento real adjudicado y su recibo.

## 9. Pruebas del recorrido (criterio de terminado de la rebanada)

1. Necesidad → evento → ruta → dos carriers invitados con aviso aprobado (en pruebas, proveedor simulado).
2. Carrier envía versión 1, luego versión 2: la 1 queda intacta y la vigente es la 2.
3. Intento de UPDATE sobre una versión: rechazado.
4. Adjudicar con evento abierto: rechazado. Adjudicar versión vencida o con rubro `no_puedo`: rechazado. Operador adjudicando: 403.
5. Adjudicar la versión 2; llega una versión 3: la adjudicación sigue en la 2 y la interfaz lo señala.
6. Entrega: recibo con huella eco igual; tarifa `pending_review`. Reintento con el mismo `operation_id`: mismo recibo, una sola tarifa.
7. Entrega con payload alterado (huella distinta): rechazada sin escrituras.
8. Pérdida de respuesta tras COMMIT: estado `incierta`; reintento manual con la misma operación devuelve el recibo.
9. Aviso de adjudicación antes del recibo: bloqueado. Editar el aviso aprobado: aprobación invalidada.
10. Publicación en Loads solo tras recibo; proyección sin token ni datos de otros carriers.
11. Usuario de otra organización: 404 en cada lectura.
12. Bitácora: una fila por transición de las pruebas 1 a 10.

El MVP solo se declara terminado cuando el propietario adjudique un evento real y el recibo exista en Rateware.
