# Skills operativos de Fr8Bid + MCP de Fr8Bid (v2)

9-nov-2026 · Reemplaza la v1 del mismo día, que se enfocaba en lo técnico. Fuentes: repo fr8bid (main b742eae: `src/servidor/proxy.ts`, `src/dominio/*`, `AGENTS.md`), LEEME de bidware-contexto, `docs/recorrido-rfx-v0.md` y la memoria del proyecto (Prima, O-I, cadencia, listas, respuestas y píxel). Solo lectura.

## La idea en una frase

Jose escribe en ChatGPT (o en Claude) algo como *«insiste a los que no han contestado en O-I»*. Un **skill** ya sabe qué pasos seguir para ese objetivo. Cada paso lo ejecuta una **herramienta del MCP de Fr8Bid**. Cuando algo sale hacia un carrier o cambia Rateware, el skill muestra el resumen y espera el «sí» de Jose en el chat. Adjudicar y entregar siguen siendo un botón en la página del evento, y el skill da la liga directa a ese botón.

```
Jose (chat) ─► Skill (operación trazada) ─► MCP Fr8Bid (herramientas) ─► /api de Fr8Bid ─► Rateware
                       │                              │
                       └─ pide «sí» antes de enviar   └─ mismas guardas que hoy (lista cerrada, HDships fuera, sin reintento)
```

---

## 1. Los skills: las frases de Jose

Están ordenados por cuánto se repiten. Las seis primeras son el **80/20**: con ellas se hace casi todo el día a día de un evento abierto.

### Diario (el 80/20)

| # | Jose dice… | El skill hace (operación trazada) | Herramientas MCP | ¿Pide «sí»? |
|---|---|---|---|---|
| 1 | «¿Qué tengo pendiente hoy?» | Recorre los eventos abiertos. Por cada uno busca: plazo cercano, intentos que ya tocan por la cadencia, ofertas nuevas, ofertas contra el target y rutas listas para adjudicar. Contesta con una lista corta de qué hacer hoy. | `eventos`, `seguimiento_evento`, `ofertas_evento` | No |
| 2 | «¿Cómo va O-I?» | Da la foto de un evento: invitados, quién abrió el correo o la liga, quién respondió y por qué canal, ofertas por ruta contra el target y días que quedan. | `evento`, `seguimiento_evento`, `respuestas_evento`, `ofertas_evento` | No |
| 3 | «Insiste a los que no han contestado en O-I» | Calcula a quién le toca el 2º intento (8 h) o el 3º (12 h). Deja fuera a quien ya cotizó, preguntó o rechazó por cualquier canal. Redacta el texto y muestra la lista. Con el «sí», crea los borradores y los envía. | `seguimiento_evento`, `respuestas_evento`, `preparar_intentos`, `confirmar` | **Sí**, una vez por tanda |
| 4 | «Pásame los WhatsApp de los que siguen sin contestar» | Arma la lista de quienes ya pasaron el 3º intento, cada uno con su liga wa.me, la lada revisada (+52 o +1) y el texto listo. Jose envía los mensajes desde su teléfono. | `seguimiento_evento`, `telefonos_carrier` | No, porque no envía nada |
| 5 | «Compárame las ofertas de O-I» / «¿a quién le doy cada ruta?» | Por ruta: all-in comparable, diferencia contra el target, modelo comercial, vigencia, condiciones e historial de versiones. Avisa de lo que bloquea la adjudicación y recomienda primario y respaldo con su razón. Al final da la liga a «Adjudicar» en Fr8Bid. | `ofertas_evento`, `historial_oferta`, `candados_ruta` | No: recomienda, no adjudica |
| 6 | «G8 me mandó su tarifa por correo» / «¿quién contestó por fuera?» | Lee las respuestas por correo, por el chat del Bid Room y las notas de WhatsApp que pase Jose. Las clasifica como cotizó, preguntó o rechazó. Si alguien cotizó, propone registrar la oferta. Si rechazó, propone marcarlo como «ya respondió». | `respuestas_evento`, `preparar_captura`, `preparar_ya_respondio`, `confirmar` | **Sí**, por oferta capturada |

### Por evento (unas veces por evento)

| # | Jose dice… | El skill hace | Herramientas MCP | ¿Pide «sí»? |
|---|---|---|---|---|
| 7 | «Llegó este RFQ de [shipper], arma el evento» (con Excel o correo pegado) | Normaliza las rutas (origen, destino, caja, operación, volumen, target y fechas). Propone plazo y condiciones. Con el «sí», crea el evento en borrador. | `leer_archivo_rfq`, `preparar_evento`, `confirmar` | **Sí** |
| 8 | «¿A quién invito para estas rutas?» | Cruza Carrier fit, las listas principal y «· Ampliada» y la evidencia real de cada carrier en la ruta y la caja. Propone a quién revisar y a quién no, con el motivo. Con el «sí», los marca como revisados. | `carriers_sugeridos`, `evidencia_carrier`, `preparar_revision`, `confirmar` | **Sí** |
| 9 | «Invita a los revisados de O-I» / «manda la siguiente tanda» | Arma tandas de 50 con la plantilla «RFx carrier invitation - Spanish». Muestra cuántos van y quién queda fuera. Con el «sí», envía la tanda. | `preparar_invitacion`, `confirmar` | **Sí**, por tanda |
| 10 | «Mueve el plazo de O-I al 13» / «publica O-I» | Muestra el cambio exacto. Con el «sí», lo aplica. Si alguien pide cerrar el evento, el skill responde que eso se hace al entregar desde Fr8Bid. | `preparar_cambio_evento`, `confirmar` | **Sí** |
| 11 | «Arma el Excel para el shipper» | Calcula la tarifa de venta con el Board price: +3 % en cost/fee plus, +12 % en brokerage y el all-in en sell share. Genera el archivo sin carrier ni costo, y revisa que no se cuele ningún dato interno. | `ofertas_evento`, `excel_shipper` | No |
| 12 | «Ya adjudiqué O-I, ¿quedó bien?» | Verifica el recibo en Rateware, que la tarifa esté en revisión y que la huella coincida con la oferta adjudicada. Revisa también los avisos de ganador, respaldo y no adjudicado, en el idioma de cada carrier. | `entrega_evento`, `avisos_evento` | No |
| 13 | «Avísales a los que no ganaron» | Prepara los avisos de no adjudicación y del respaldo y los muestra. Da la liga a la sección de avisos en Fr8Bid para aprobarlos y enviarlos. | `preparar_avisos` | Se aprueba en Fr8Bid |

### Carriers y tarifas (entre eventos)

| # | Jose dice… | El skill hace | Herramientas MCP | ¿Pide «sí»? |
|---|---|---|---|---|
| 14 | «¿Cuánto hemos pagado en Monterrey → Laredo caja seca?» | Busca el histórico de tarifas en Rateware y las ofertas de RFx anteriores para esa ruta y caja. Da rango, la más reciente y quién la dio. | `tarifas_ruta` | No |
| 15 | «¿Qué sabemos de [carrier]?» | Da el perfil, las listas donde está, las rutas que cotizó, sus respuestas pasadas, si hubo rebotes y sus teléfonos. | `carrier`, `historial_carrier` | No |
| 16 | «[Carrier] no tiene contacto, búscame uno» | Primero busca contactos conocidos que no hayan rebotado. Si no hay, busca en Apollo (gratis) por puesto. Antes de revelar un correo, dice cuántos créditos cuesta. | `contactos_carrier`, `apollo_buscar`, `apollo_revelar` | **Sí** al revelar (gasta créditos) |
| 17 | «Agrega a [carrier] a la lista D2D Dry Van» | Muestra la evidencia que justifica el alta. Con el «sí», lo da de alta en la lista. | `preparar_alta_lista`, `confirmar` | **Sí** |

**Lo que ningún skill hace**, aunque se le pida en el chat:
- Adjudicar, limpiar una adjudicación o entregar a Rateware. Eso es un botón en la página del evento (AGENTS.md regla 6), y el skill da la liga.
- Modificar una oferta que ya existe.
- Cerrar, rechazar o avisar en Prima, que sigue como «ruta abierta».
- Tocar HDships.
- Enviar WhatsApp.

---

## 2. El MCP de Fr8Bid

Es un servidor MCP remoto que vive dentro del mismo proyecto de Vercel: `fr8bid.heymarksman.com/api/mcp`. Cada herramienta llama a la `/api` de Fr8Bid que ya existe, así que hereda las guardas del proxy y no reconstruye reglas.

### Tres tipos de herramientas

1. **Lectura**, libres: `eventos`, `evento`, `seguimiento_evento`, `respuestas_evento`, `ofertas_evento`, `historial_oferta`, `candados_ruta`, `carriers_sugeridos`, `evidencia_carrier`, `carrier`, `historial_carrier`, `contactos_carrier`, `telefonos_carrier`, `tarifas_ruta`, `entrega_evento`, `avisos_evento`. Debajo usan `list_rfx_events`, `list_rfx_detail`, `list_outreach_messages`, `list_rfx_carrier_replies`, `list_rfx_lane_conditions`, `carrier_recommendations`, `list_rateware`, `list_vendors` y `list_contact_history`.
2. **Preparar**, que no escriben nada: `preparar_intentos`, `preparar_captura`, `preparar_ya_respondio`, `preparar_evento`, `preparar_revision`, `preparar_invitacion`, `preparar_cambio_evento`, `preparar_alta_lista`, `preparar_avisos`. Cada una devuelve un resumen legible y un `confirmacion_id` que vence en 15 minutos y queda atado al contenido exacto. Si algo cambia, ese id deja de servir.
3. **`confirmar(confirmacion_id)`**, la única que escribe. El skill solo la llama después de un «sí» explícito de Jose en el chat, y queda registrada en la bitácora: quién, qué, cuándo y la frase del OK. Debajo usa `draft_bid_room_carrier_message`, `send_outreach_messages`, `update_rfx_bid` (solo para capturar una oferta nueva o marcar «ya respondió»), `record_rfx_invitation_wave_review`, `shortlist_rfx_lane_vendors`, `create_outreach_campaign`, `invite_rfx_lane_vendors` y `update_rfx_event` (plazo y publicar; cerrar no).

Fuera del MCP a propósito: `award_rfx_lane_vendor`, `clear_rfx_award`, `closeout_awarded_rfx_to_rateware` y el envío de avisos de adjudicación. Para esos, el MCP devuelve la liga al botón en Fr8Bid.

### Requisitos para que funcione en ChatGPT

- **Inicio de sesión:** ChatGPT exige OAuth en conectores remotos. El MCP usa el mismo login de Google y Supabase de Fr8Bid, así que Rateware sigue aplicando el rol de quien está conectado.
- **Usuario para agentes:** si el MCP lo usa Codex u otro agente sin Jose presente, conviene un usuario **Operador**. Rateware no le deja adjudicar.
- **Creación de eventos:** `create_rfx_event` e `import_rfx_lanes` siguen marcados como «solo simulado» en Fr8Bid. Hay que habilitarlos para el skill 7. Ese cambio es de producto, lo hace Claude por PR.

### Quién hace qué

- **Codex:** los 17 skills (cada uno con su archivo de operación trazada y ejemplos de frases) y el MCP. Ambos son herramientas de agente, así que entran en su parte según AGENTS.md regla 7. Todo va por PR al repo fr8bid.
- **Claude:** lo que falte en la app, como habilitar el alta de eventos o las ligas directas a cada botón de la página del evento, y la revisión de los PR de Codex.

---

## 3. Orden sugerido

1. **MCP con herramientas de lectura más los skills 1, 2, 5 y 14.** Ninguno escribe nada, así que se pueden probar en vivo con O-I desde el primer día.
2. **Preparar y `confirmar` más los skills 3, 4, 6 y 9.** Es la insistencia, las respuestas y las tandas: lo que más tiempo se llevó en Prima.
3. **Skills 12 y 13**, listos antes de adjudicar O-I (plazo 13-nov).
4. Después, los skills 7, 8, 10, 11, 15, 16 y 17.

## 4. Lo que Jose decide

1. ✅ **Decidido 9-nov: los envíos se confirman con un «sí» en el chat.** (Pregunta original: si los envíos (intentos, invitaciones y tandas) se pueden confirmar con un «sí» en el chat, o si también se quedan como botón en Fr8Bid. Recomiendo el «sí» en el chat. El contenido exacto queda atado a la confirmación y la bitácora guarda la frase, y así una instrucción conversacional sí termina el trabajo. Adjudicar y entregar se quedan en Fr8Bid en cualquier caso.
2. **En qué chat se usa primero**, ChatGPT o Claude. El MCP es el mismo para los dos y solo cambia dónde se conecta.
