# R1 · Condiciones de ruta en Rateware

Parche propuesto, sin aplicar: `R1-rateware-condiciones-de-ruta.patch` (junto a este archivo).
Base: Rateware 59337fab (worktree `radar-rfi-git-close-20261015`, leído solo como consulta). Rateware main real es más nuevo (incluye `rfx_handoff_atomic`); hay que reaplicar el parche sobre main y correr sus pruebas antes de publicarlo.
Propuesta de producto: [Condiciones de ruta para Fr8Bid](https://claude.ai/artifact/XsMH2VSiXmwXozmimwtZNm). Jose eligió la opción A (ampliar el catálogo en Rateware) el 22-oct.

## Qué hay hoy (verificado en el código)

- Las respuestas del carrier viven en `rfx_segment_confirmations` (`rubric_key` texto libre, `answer` ∈ pending · agree · exception · disagree · not_applicable, `comment`, `metadata`). **La base no restringe las claves.**
- El candado está en una sola línea de `rfx-bid-api`: `SEGMENT_CONFIRMATION_RUBRICS` con las 6 claves genéricas; cualquier otra da «Invalid segment rubric».
- Los 6 rubros son confirmaciones de 6 columnas de texto de `rfx_lanes` (logistics_model, operation_criteria, …). No hay dato, objetivo ni marca obligatoria/deseable.
- Rateware no bloquea la adjudicación por rubros; el candado «no puedo» (disagree) lo aplica Fr8Bid.
- No existe un campo JSON libre por ruta donde guardar condiciones: `rfx_lanes` no tiene jsonb y `rfx_events.rfx_master_package` es por evento y lo escribe el flujo de paquetes. Usarlo sería un puente frágil, así que se descarta.

## Qué cambia

### 1. Migración `20261022120000_rfx_lane_conditions.sql` (solo aditiva)

- Tabla nueva `rfx_lane_conditions`: una fila por ruta y condición, con `condition_key`, `importance` (required · preferred), `target` (jsonb, del tipo de la condición), `note`, `sort_order` y `revision`. Única por (ruta, condición), se borra en cascada con la ruta o el evento.
- `rfx_segment_confirmations` gana `value jsonb` (el dato del carrier) y `condition_revision` (qué versión de la condición contestó).
- Sin políticas para el navegador: solo las funciones (service_role) la leen y escriben, como el resto del Bid Room desde el 3-ago.

### 2. Catálogo compartido `_shared/rfx-lane-conditions.mjs`

Módulo puro, usado por las dos funciones. Catálogo v1 de 29 condiciones en 7 grupos (equipo, capacidad y tiempos, cruce fronterizo, seguro y cumplimiento, tarifa y accesoriales, servicio y seguridad, pago), cada una con tipo de dato (número, dinero, sí/no, opción, texto), unidad y cómo se compara con el objetivo (al menos, a lo más, igual). Etiquetas en español e inglés.

El catálogo vive en código, versionado, y no en una tabla: así una condición no se crea por error y la Mesa y la liga leen la misma lista. Si después se quiere que el Administrador cree condiciones propias, se pasa a tabla sin cambiar el contrato.

### 3. `rateware-api` (equipo)

| Acción | Rol | Qué hace |
|---|---|---|
| `list_rfx_condition_catalog` | lectura | `{ version, conditions }` |
| `list_rfx_lane_conditions { event_id }` | lectura | condiciones de todas las rutas del evento |
| `save_rfx_lane_conditions { event_id, lane_id, conditions: [{ condition_key, importance, target?, note? }] }` | operador | reemplaza el juego de esa ruta; 409 si el evento está cerrado, adjudicado o archivado, o si su plazo (`due_date`, hora de México) ya pasó; deja bitácora `bid_room.lane.conditions` |
| `list_rfx_segment_confirmations` | lectura | ahora también trae `value` y `condition_revision` |

Si cambia la importancia, el objetivo o la nota de una condición, sube su `revision`. Las respuestas anteriores no se reescriben: quedan con su revisión vieja y Fr8Bid las muestra como «por confirmar de nuevo».

### 4. `rfx-bid-api` (carrier)

- `get_invitation` devuelve `lane_conditions` de la ruta de esa invitación, con etiqueta, tipo, unidad, objetivo, importancia y `rubric_key` listo para contestar.
- `save_segment_confirmations` acepta, además de las 6 claves de siempre, `rubric_key: "cond.<clave>"` con `segment_key: "lane"` y `value`. Reglas:
  - la condición debe existir en la ruta de esa invitación;
  - el dato debe ser del tipo correcto; en condiciones numéricas, «cumple» o «cumple con condición» exigen el número;
  - «cumple con condición» exige comentario;
  - «cumple» con un dato que no alcanza el objetivo se rechaza (debe ser excepción o no cumple);
  - con el evento cerrado, adjudicado, archivado o con el plazo vencido ya no se aceptan respuestas a condiciones. El plazo cuenta porque Fr8Bid cierra a ofertas moviendo `due_date` con el estado aún «open» (ajuste pedido por la Mesa el 22-oct).

## Compatibilidad con eventos existentes

- No se borra ni se modifica ninguna columna ni fila. Los 6 rubros siguen aceptándose y mostrándose igual.
- Un evento sin condiciones se comporta exactamente como hoy: `lane_conditions` llega vacío.
- La liga vieja de Bidware (bidware.heymarksman.com) ignora el campo nuevo y sigue funcionando.
- El evento HDships y RFx-FR8BID-PRUEBA-01 no se tocan.

## Contrato para Fr8Bid (Mesa y liga)

- Mesa, al preparar la ruta: `list_rfx_condition_catalog` → el Operador elige y marca obligatoria/deseable → `save_rfx_lane_conditions`.
- Liga del carrier: pinta `lane_conditions`; contesta con `save_segment_confirmations` usando `rubric_key`, `segment_key: "lane"`, `answer`, `value`, `comment`.
- Comparativo: cruza `list_rfx_lane_conditions` con `list_rfx_segment_confirmations` por `rubric_key`. Candado de adjudicación en Fr8Bid: una condición **obligatoria** con `disagree`, sin respuesta, o con `condition_revision` menor que la `revision` vigente bloquea; en una deseable solo se marca.

## Pruebas

- 7 pruebas unitarias del catálogo, las reglas y el cierre por plazo (`rfx-lane-conditions.test.mjs`, `node --test`): 7/7 en verde.
- El parche aplica limpio sobre 59337fab y los tres archivos TypeScript compilan (revisión de sintaxis con esbuild). No corrí el typecheck de Deno ni las pruebas de Rateware: se hace al reaplicarlo sobre main.

## Qué falta y quién decide

1. Reaplicar el parche sobre Rateware main, correr sus pruebas y registrar las 3 acciones en el contrato de acciones de Rateware (no lo revisé). Aplicar la migración en rateware-prod y desplegar las dos funciones necesita el OK de Jose.
2. Fr8Bid: el simulado y la Mesa/liga adoptan el contrato (hilo «Construcción de la Mesa del evento»).
3. Preguntas abiertas de la propuesta: qué condiciones sobran o faltan, si los juegos por tipo de ruta los define el Administrador y si el shipper ve las condiciones.
