# MCP de Fr8Bid: contactos de carriers

Herramientas (Operador/Administrador, sesión OAuth del MCP):

| Herramienta | Qué hace | Escribe | Créditos |
|---|---|---|---|
| `buscar_contacto` | Lee contactos conocidos del carrier (mismo dominio, sin rebotados ni suprimidos) y la operación en curso. Con `buscar_en_apollo=true` (Operador) busca personas en Apollo y las ordena por puesto: dueño, dirección o VP comercial, dispatch, tráfico, logística, ventas. | Solo con Apollo: Rateware guarda la lista de candidatos 1 h | 0 |
| `preparar_revelar_contacto` | Administrador. Vista previa firmada: carrier, persona (`candidato_ref` de la búsqueda), costo máximo y efecto en el CRM. | No | 0 |
| `preparar_elegir_contacto` | Vista previa firmada para fijar como principal un correo conocido (p. ej. sustituir uno rebotado). | No | 0 |
| `confirmar` | Con el «sí» del propietario: relee el carrier y, si nada cambió (dominio, contacto, costo, operación), crea la operación durable (`prepare_reveal`) y la reclama una vez (`confirm_reveal`), o elige el correo (`choose_known`). | Sí | Hasta el máximo mostrado |

## Contrato reutilizado

- Fr8Bid #46: `/api/contactos-empresa` (adaptador y compuerta `FR8BID_ESCRITURAS_REALES`).
- Rateware #203: `carrier-contacts-api`. La organización sale del principal; una operación por organización, empresa y persona; el «claim» cambia `draft → processing` una sola vez con hash y vencimiento de 15 min; la política de créditos (`APOLLO_EMAIL_CREDIT_POLICY`) se compara al reclamar.
- Nunca se usa `/api/apollo` ni Apollo directo.

## Garantías

- Preparar no crea operación ni reserva créditos; la vista previa es un JWT firmado con `FR8BID_MCP_CONFIRM_SECRET` ligado a usuario, cliente OAuth, carrier, persona, costo y vencimiento.
- Confirmar exige correo de `FR8BID_MCP_APROBADORES`, rol vigente y una frase afirmativa sin dudas.
- Repetición o dos confirmar simultáneos: Rateware solo deja reclamar una operación; la relectura rechaza la repetición. Un resultado incierto se informa y no se reintenta.

## Pendiente

- No hay operación de Rateware para agregar al CRM a una persona puesta en copia (correo secundario); solo se puede elegir entre los conocidos.
- Sin probar contra Rateware real: falta verificar que el token OAuth del MCP lo acepte `carrier-contacts-api`, que la política de créditos esté configurada y que #46 y #203 estén desplegados.
