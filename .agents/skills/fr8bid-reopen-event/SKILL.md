---
name: fr8bid-reopen-event
description: Reabre con un plazo nuevo un RFx cerrado a ofertas en Fr8Bid. Úsala para reabrir una licitación, volver a habilitar cotizaciones o ampliar el cierre de un evento vencido. Los eventos abiertos o en borrador siguen el flujo de extensión de plazo.
---

# Reabrir una licitación RFx

1. Usa **Fr8Bid MCP** con la sesión OAuth del usuario. Resuelve el folio o nombre con `eventos`. Si hay más de una coincidencia, pide el folio. Para un evento abierto o en borrador, usa el procedimiento **fr8bid-extender-plazo**.
2. Resuelve la fecha relativa en `America/Mexico_City` y muestra la fecha absoluta (AAAA-MM-DD). El plazo cierra al final de ese día. Si «el viernes» o «una semana más» admite varias fechas, aclara el día exacto. Pide un motivo si la solicitud no lo proporciona.
3. Llama `preparar_reapertura_evento` con `event_id`, `nueva_fecha` y `motivo`. Muestra folio, estado, plazo anterior y nuevo, rutas, ofertas y participaciones conservadas, dependencias, motivo, responsable y vencimiento de la confirmación. Si la vista quedó bloqueada, explica los motivos y enlaza `mesa_url` para revisión administrativa. Una adjudicación, un aviso, una entrega o un proceso operativo ligado requieren revisión antes de reabrir.
4. Pide al propietario de reapertura de Rateware una respuesta breve, por ejemplo «Sí, confirmo», en un mensaje posterior a su propia vista previa. Solo ese propietario con rol administrador puede confirmar. Usa `confirmar` con el `confirmacion_id` vigente y el texto literal de la autorización en `frase_ok`. Si cambió la fecha, el evento o la versión, muestra una nueva vista previa y pide una autorización nueva.
5. Informa el recibo y si la relectura verificó el estado abierto y el plazo. Si el resultado es incierto, consulta `eventos` y comparte la liga de Fr8Bid para conciliar la operación. Una vista previa vencida requiere empezar desde la consulta. Las invitaciones, recordatorios y demás comunicaciones son operaciones separadas que requieren su propia autorización.

Si `preparar_reapertura_evento` no aparece o Rateware devuelve `ACCION_NO_DESPLEGADA`, indica que el flujo no está disponible en esa conexión. Mantén el evento intacto. No uses `preparar_cambio_evento` para simular una reapertura de un evento cerrado.
