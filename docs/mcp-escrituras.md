# MCP de Fr8Bid · entrega 2: cambios con confirmación

2026-11-12. Rama `claude/mcp-entrega-2` sobre `origin/main` (`761b343`).
Estado: desarrollado y probado en local contra el simulado (evento `RFx-FR8BID-PRUEBA-01`); no desplegado ni usado con datos reales.

## Qué agrega

El endpoint `/api/mcp` sigue con las 11 lecturas para todos los roles y, para Operador y Administrador, suma cinco herramientas. `preparar_*` solo lee y devuelve una vista previa con `confirmacion_id` (anotación `readOnlyHint`); `confirmar` es la única que escribe (`destructiveHint`).

| Herramienta | Rol | Acción del proxy al confirmar |
| --- | --- | --- |
| `preparar_intentos` | Operador | `draft_bid_room_carrier_message` por carrier (clave `claveIntento`). Queda **borrador en la Cola**; no se envía. Usa `intentosPorPreparar`/`textoIntento`: cadencia y exclusión de quien ya respondió. |
| `preparar_revision` | Administrador | `record_rfx_invitation_wave_review` (`marcarRevisado`). |
| `preparar_invitacion` fase `borradores` | Operador | `create_outreach_campaign` (si falta; `claveCampana`) + `generate_outreach_drafts`, solo carriers con «Revisado» vigente. |
| `preparar_invitacion` fase `envio` | Administrador | `send_outreach_messages` de una tanda de hasta `MAXIMO_POR_LLAMADA` (100) con `expected_versions` y `operation_id` (`operacionTanda`). Evento abierto; el MCP no publica. |
| `preparar_cambio_evento` | Administrador | `update_rfx_event {patch:{due_date}}`: solo extender, evento abierto o borrador, fecha nueva > plazo actual y > hoy (México). |
| `confirmar` | según la acción | Ejecuta la vista previa firmada. |

Las vistas previas llevan destinatarios, canal (si queda en la Cola o se envía) y texto exacto, y quiénes quedan fuera y por qué. Los cuerpos se arman con los mismos métodos de `MesaApi` que usa la Mesa (sin ejecutarlos), salvo `app_origin`, fijo en `https://fr8bid.heymarksman.com`.

Fuera del MCP (se hacen en la Mesa; las respuestas dan `mesa_url` = `https://fr8bid.heymarksman.com/eventos/<id>`): `award_rfx_lane_vendor`, `clear_rfx_award`, `closeout_awarded_rfx_to_rateware`, `generate_rfx_award_notices` y cualquier aviso de adjudicación. También quedan fuera crear eventos, importar rutas, preseleccionar, condiciones, marcar invitadas por otro canal, publicar y enviar intentos de seguimiento (se aprueban en la Mesa o la Cola). HDships (`EVENTOS_PROTEGIDOS`) no se lee ni se escribe. PRIMA (`RFx-1021-PRIMAPro`) nunca se cierra ni se rechaza: el plazo solo avanza.

## Captura de ofertas y «ya respondió» (pendiente)

`preparar_captura` salió de esta entrega. La regla del propietario «nunca modificar ofertas» no se puede garantizar desde Fr8Bid: una oferta del carrier puede entrar entre la relectura y `update_rfx_bid`. Requiere una escritura condicional y atómica en Rateware («actualiza solo si `bid_rate` sigue en null») y se retoma en el hilo de captura con IA. `preparar_ya_respondio` también salió: `update_rfx_bid` sin tarifa pone `bid_rate` en null en Rateware y podría borrar una oferta que entre entre la guarda del proxy y la escritura. Las dos acciones quedan pendientes de una **escritura condicional atómica en Rateware** (`… WHERE bid_rate IS NULL`). `update_rfx_bid` ya no está en `ESCRITURAS_MCP`: el MCP no lo envía en ningún caso. Mientras tanto, capturar ofertas y marcar «respondió/rechazó» se hacen en la página del evento.

Nota: la página del evento tiene hoy la misma carrera (la guarda `YA_OFERTO` del proxy relee antes de escribir, pero no es atómica). Corregirla es una mejora de Rateware, no de esta entrega.

## Camino de cada escritura

`confirmar` → transporte de escritura (`src/mcp/transporte.ts`, lista cerrada `ESCRITURAS_MCP`, subconjunto de `ESCRITURAS`) → `POST /api/rateware` del mismo recurso con el token OAuth del usuario → `manejar` del proxy (lista cerrada, `FR8BID_ESCRITURAS_REALES`, HDships fuera, guardas con lectura fresca, sin reintentos) → Rateware, que vuelve a aplicar el rol. Un fallo de red o 504 queda como `incierta` y no se reintenta. Si `FR8BID_ESCRITURAS_REALES` no permite la acción, el proxy responde 423 y `confirmar` lo dice. El transporte de lectura no cambió.

## Contrato de confirmación (sin estado de servidor)

- `confirmacion_id` = JWT HS256 firmado con `jose` y `FR8BID_MCP_CONFIRM_SECRET`. Claims: `sub` (usuario), `client_id`, `act` (acción), `ev` (evento), `arg` (argumentos normalizados), `cuerpos` (los cuerpos exactos que irán al proxy), `h` = SHA-256 del JSON canónico de `cuerpos`, `pre` = SHA-256 de la foto de precondiciones, `iss`/`aud` propios, `iat`, `exp` = 15 min, `jti`.
- `confirmar(confirmacion_id, frase_ok)`: `frase_ok` es el texto literal del «sí» del usuario y debe ser una afirmación explícita de la lista blanca (sí, confirmo, ok, adelante, dale, hazlo, envíalo, autorizo, yes, confirm; sin importar mayúsculas, acentos ni signos). Cualquier negación o duda (no, espera, quizá, tal vez, duda, luego, después, por ahora, pero…) la invalida aunque diga «sí». Valida firma, emisor, audiencia y vigencia; que `sub` y `client_id` sean los de la sesión OAuth actual; el rol de la acción (se revisa al preparar y al confirmar); `h` recalculado; que cada cuerpo sea de `ESCRITURAS_MCP` y del mismo evento. Luego vuelve a leer el evento (`list_rfx_detail` y lo demás de la Mesa), recalcula el plan y se niega si la foto o los cuerpos cambiaron («ya aplicado o el evento cambió»). Así un segundo `confirmar` de la misma vista previa falla.
- En la fase de borradores, `h` y `pre` incluyen además la huella de la plantilla (asunto, cuerpo y versión si existe) y la lista de destinatarios: si cambian entre preparar y confirmar, no se genera nada.
- Un 2xx sin la forma esperada de la acción (JSON inválido, `incierta`, sin `row`/`rows`/`outreach_message` o sin los contadores `sent`/`failed` de la tanda) NO cuenta como hecho: `confirmar` responde `incierta` con `RESPUESTA_INVALIDA` y «revisa en la página del evento antes de repetir»; nunca cuenta como enviado lo no confirmado.
- La tanda solo toma mensajes con estado crudo `drafted`, `queued` o `failed`; los que están en proceso (`sending`) quedan fuera («en proceso») y no alteran la tanda ni su `operation_id`.
- Los intentos fijan en `pre` el carrier y el correo de cada destinatario; si cambian, `confirmar` se niega. Si no se pudo saber quién respondió (falla o `PASO_EN_RATEWARE`), no se prepara ningún intento.
- Reglas de cada acción: las mismas que la Mesa, en `src/dominio/acciones-mesa.ts` (usado por `Mesa.tsx` y por el MCP): estado del evento, estado de la participación, «Revisado», protegidos. Se aplican al preparar y otra vez al confirmar.
- Tamaño: ningún `confirmacion_id` pasa de 60 000 caracteres. Si una selección de intentos no cabe, `preparar_*` la parte en varias confirmaciones (`partes`, cada una con su vista previa y su «sí»), siempre por carrier completo (nunca separa las rutas de un carrier); si un solo carrier no cabe, o en las demás acciones, se pide acotar la selección.
- Resultado: `aplicada` solo si Rateware reflejó todo lo aprobado (borradores generados por carrier, enviados = tanda, estado/plazo reflejados). Crear la campaña de invitación persiste: si después los borradores fallan o salen en cero, el resultado es `parcial` con «Campaña creada (id), borradores no generados». Si no hizo nada, `sin_efecto`; si hizo una parte, `parcial`; ambos con `omisiones` (id y motivo).
- Idempotencia que se conserva: `claveIntento` en intentos, `claveCampana` en la campaña, `operation_id` y `expected_versions` en tandas.
- Sin `FR8BID_MCP_CONFIRM_SECRET` (o con menos de 32 caracteres): `preparar_*` y `confirmar` responden `CONFIRMACIONES_PENDIENTES` («confirmaciones pendientes de configurar», equivalente 503). Las 11 lecturas siguen.
- Registro: cada `confirmar` escribe un `console.info` JSON (`tipo: fr8bid_mcp_confirmar`) con usuario, cliente, rol, acción, evento, `h`, `jti`, `frase_ok` (100 caracteres) y resultado (`aplicada`, `parcial`, `incierta`, `rechazada:<código>`). Sin tokens ni secretos.

### Riesgo residual (aceptado por el propietario)

Dos `confirmar` simultáneos de la misma vista previa pueden pasar ambos la relectura antes de que el primero escriba. Intentos, campaña y tandas quedan cubiertos por sus claves idempotentes en Rateware; una marca de respuesta podría registrarse dos veces (mismo estado y nota). Mejora posterior: tabla de nonces (`jti`) en Rateware con inserción única antes de escribir. No se toca ahora.

## Lo que debe hacer Jose para activarlo

1. En Vercel (proyecto `fr8bid`, Production), crear `FR8BID_MCP_CONFIRM_SECRET` con un valor aleatorio de al menos 32 caracteres (por ejemplo `openssl rand -base64 48`). No se comparte con nadie ni se pone en el repo. Cambiarlo invalida las vistas previas pendientes (vencen igual a los 15 min).
2. Opcional: `FR8BID_MCP_APROBADORES` con los correos (separados por coma) que pueden **confirmar** envíos reales de tandas (`send_outreach_messages`) y cambios de plazo (`update_rfx_event`). Sin la variable, solo `sales@heymarksman.com`. Otro Administrador puede preparar la vista previa, pero `confirmar` responde «solo el propietario puede confirmar esto» (`SOLO_PROPIETARIO`). Borradores (intentos, campaña, generar) y «Revisado» siguen con la regla de rol.
3. Las escrituras reales siguen gobernadas por `FR8BID_ESCRITURAS_REALES` del proxy: con `no` todo `confirmar` devuelve 423; con `borradores` solo pasan los intentos (borradores en la Cola).
4. Fusionar el PR a `main` (Vercel despliega `main`).

Nota: una tanda de 100 envíos depende del tiempo máximo de la función `/api/mcp` en Vercel (el transporte corta a 28 s y lo deja `incierta`, sin reintentar; repetir la misma tanda no duplica por `operation_id`).

## Skills

`.claude/skills/fr8bid-insistir`, `fr8bid-invitar-tanda` y `fr8bid-extender-plazo`: paso a paso, siempre vista previa y «sí» en un mensaje nuevo antes de `confirmar`, sin reintentos.

## Verificación

`test/mcp-escrituras.test.ts` (simulado, `RFx-FR8BID-PRUEBA-01`): token (firma, vencimiento, otro usuario o cliente, `h` alterado, otro secreto), replay rechazado por la foto, roles (viewer y Operador donde toca, revalidado al confirmar), adjudicar/entregar inaccesibles, HDships y PRIMA, plazo solo hacia adelante, cadencia que excluye a quien respondió, sin secreto con lecturas funcionando, `frase_ok` vacía o negativa, invitación en dos fases y anotaciones MCP.
