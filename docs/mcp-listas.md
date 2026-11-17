# MCP de Fr8Bid: listas de carriers

Fuente de verdad: Rateware `public.vendor_segments` con `segment_type='participant_template'`. Los miembros están en `vendor_ids` y cada nombre de lista es único por organización. «Principal» y «· Ampliada» son dos listas distintas, emparejadas por nombre (`src/bidware/features/carrier-templates/evidence-review.ts`). Una lista no es la shortlist de un evento (`rfx_lane_vendors`), no es «Revisado» (auditoría `rfx.invitation_carrier.reviewed`) y no es una invitación.

| Herramienta | Qué hace | Escribe |
|---|---|---|
| `listas_carrier` | Lista las listas de la organización (hasta 1 000) y, con `carrier_id`, en cuáles está el carrier. | No |
| `preparar_alta_lista` | Vista previa firmada del alta de un carrier en una lista exacta, con evidencia, tipo y efecto. Si el carrier ya pertenece, lo informa sin firmar nada. Rechaza listas archivadas. | No |
| `confirmar` | Con el «sí» del propietario: relee la lista. Si el carrier ya está, no escribe. Si la lista cambió, rechaza. Si no, manda `update_carrier_list_template` con `expected_version`. | Sí |

## Contrato de Rateware reutilizado (sin cambios de backend)

- `list_carrier_list_templates`, `get_carrier_list_template`, `update_carrier_list_template` (`supabase/functions/rateware-api/index.ts`). La organización sale de la sesión. Las escrituras exigen el permiso `vendors:manage`. Todo está detrás de `CARRIER_LIST_TEMPLATES_V2_ENABLED`.
- Concurrencia: el UPDATE es condicional a `template_version` (`conditionalCarrierTemplateUpdate`). Si otro cambió la lista, responde 409 `template_version_conflict` y no pisa nada. Rateware valida que los miembros nuevos sean de la organización y deja auditoría `carrier_template.add_members`.
- El proxy de Fr8Bid solo deja pasar `vendor_ids` con `expected_version` (nunca nombre ni estado), y lo hace bajo `FR8BID_ESCRITURAS_REALES`.

## Pendiente

- No hay acción de Rateware para «listas de un carrier»: se recorren las listas página por página.
- Sin probar contra Rateware real. Falta verificar que la bandera esté encendida en rateware-prod, que el token OAuth del MCP traiga `vendors:manage` y que el owner pueda escribir con `FR8BID_ESCRITURAS_REALES`.
