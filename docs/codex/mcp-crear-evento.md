# Crear eventos RFx desde MCP

Corte: 17-nov-2026. Implementación local; no acredita despliegue ni disponibilidad en ChatGPT.

## Diagnóstico y decisión

Fr8Bid ya tenía `crearEvento()` y el formulario de Bidware. Rateware normaliza eventos y rutas, pero `create_rfx_event` e `import_rfx_lanes` son dos escrituras independientes y sincronizan Ratebooks. El proxy mantiene esas acciones genéricas restringidas a simulación. El MCP carecía de alta de eventos.

| Alternativa | Ajuste y costo | Decisión |
| --- | --- | --- |
| Componer las dos escrituras actuales | Menos SQL, pero puede dejar evento sin rutas y duplicar tras timeout; requiere recuperación y compensaciones | Descartada |
| Adaptador de borrador y una transacción Rateware | Reutiliza identidad, catálogos, normalizadores, tablas y confirmaciones; agrega recibo idempotente y una migración | Elegida |
| Otro backend o workflow externo | Duplica autoridad, permisos y mantenimiento | Descartada |

Se reutilizan los patrones de confirmación del MCP y de operaciones idempotentes de Rateware (sin confundir `rfx_projects` con `rfx_events`). No hay proveedor, infraestructura de pago ni dependencia nueva. La transacción usa `SECURITY INVOKER` y ejecución exclusiva del servidor, conforme a la [documentación de funciones de Supabase](https://supabase.com/docs/guides/database/functions). Se revisó el [changelog](https://supabase.com/changelog.md); no se actualizó el SDK ni el CLI.

## Contratos y experiencia

`preparar_evento` exige nombre, tipo `spot|bid|rfx`, visibilidad explícita y 1–50 rutas con origen/destino. Acepta descripción, cliente/customer_id, fechas ISO, `equipment`, `trailer`, operación, servicio, moneda, target y los apartados de condiciones ya existentes. Usa `trailer: "Dry Van"` para el tipo de caja. Cada campo opcional se valida y se guarda por separado. Rechaza campos de autoridad, estado, invitaciones y datos no admitidos. No inventa fechas ni completa desconocidos.

La vista previa muestra `payload.event`, `payload.lanes`, `missing`, `blocking`, `warnings` e impacto: un borrador y sus rutas, sin invitaciones. Valida equipo, caja, operación y servicio con sus catálogos activos del workspace, y customer_id con el acceso existente a shippers. En un rechazo conocido muestra el código de Rateware y un mensaje en español. La moneda sigue el contrato Rateware de código de tres letras; no existe un catálogo administrado de monedas. Las direcciones son texto, no geocodificación certificada.

Falta moneda: `estado: incompleta`, `confirmacion_id: null`. La columna de rutas es NOT NULL; no se aplica el default USD. Equipo, cliente, target y plazo desconocidos permanecen null cuando el contrato admite borrador. Peso, dimensiones y horarios siguen en los apartados libres del contrato; se advierte que deben revisarse, no se extraen ni inventan.

Cuando es creable devuelve un token de 15 minutos. El asistente debe mostrar la vista completa y esperar otro mensaje humano. `confirmar_creacion_evento({confirmacion_id, frase_ok})` verifica firma, vencimiento, usuario, cliente OAuth, rol y frase afirmativa del propietario; reconsulta Rateware y vincula también la organización y el contenido normalizado. Rateware verifica nuevamente la identidad autenticada, el rol, la aprobación y la huella antes de invocar la transacción.

El recibo incluye event_id, folio persistido, estado inicial draft, IDs de rutas, fecha, actor, organización, operation_id y liga `/eventos/<event_id>`. Se lee `list_rfx_detail` antes de informar `aplicada`. Si esa lectura falla: `parcial`, persistencia completa y verificación pendiente. Timeout, 5xx o recibo inválido: `incierta`; jamás reintentar automáticamente. Conservar operation_id para conciliar con el recibo/auditoría de Rateware antes de pedir otra preparación. No se debe crear una nueva operación para ocultar un resultado incierto.

La creación no autoriza `preparar_revision`, invitaciones, envíos ni adjudicación. `evento`, `ofertas_evento` y `seguimiento_evento` ya aceptan los IDs creados. Carrier fit, tarifas y preparación de invitaciones conservan sus reglas y necesitan los datos/carriers revisados correspondientes; no se certificó su calidad comercial con carriers reales.

## Seguridad y dependencias

- PR Fr8Bid: rama `codex/fr8bid-mcp-crear-evento`.
- PR Rateware: rama `codex/rateware-mcp-crear-evento`, adaptador y RPC `create_rfx_event_draft_once` con migración `20261119123200_rfx_event_draft_atomic.sql`.
- No se modifica Auth ni se añaden credenciales. Cada petición usa OAuth y el bearer del usuario; Rateware revalida contra Auth y resuelve el workspace. Su cliente interno existente ejecuta el RPC únicamente después de esas verificaciones. El RPC no se concede a anon/authenticated.
- El propietario permitido en Rateware es `sales@heymarksman.com`, coherente con el valor por omisión del MCP. Una configuración adicional de aprobadores en Fr8Bid no amplía esa autoridad del backend.
- `FR8BID_ESCRITURAS_REALES` permanece intacto: `no` y `borradores` no habilitan esta creación; requiere `si`. No se cambió ninguna variable.
- Las dos ramas desactivan previews automáticos en sus respectivos `vercel.json`.
- Orden futuro, con aprobación separada: revisar/fusionar y aplicar Rateware, desplegar su backend, habilitar Fr8Bid, descubrir herramientas en la conexión real y ejecutar una prueba específicamente autorizada. Nada de esto se hizo en este encargo.

## Verificación reproducible

Fr8Bid: `npm run agentes:verificar` (typecheck, pruebas, Bidware, build).

Rateware: `npm run test:rfx-event-draft`, `npm run test:rfx-conditional-writes`, `npm run test:rfx-event-draft:postgres`, `deno check --node-modules-dir=none --no-lock supabase/functions/rateware-api/index.ts`, validación de action-contract y migraciones.

Integración entre checkouts, desde Rateware:

```text
node tools/test-rfx-event-draft-postgres.mjs --mcp-checkout <checkout-local-de-fr8bid>
```

Requiere Docker local, la imagen ya instalada `postgres:16-alpine`, Deno con dependencias cacheadas y dependencias locales de Fr8Bid. No descarga imágenes; contenedor sin red, sin volúmenes del host y eliminado al finalizar. El test comprueba creación, lectura, rechazo con el candado apagado, repetición, rollback, aislamiento y concurrencia. El manejador y SQL son reales; identidad, catálogos y fuentes opcionales son sintéticos. No prueba OAuth hospedado ni el esquema íntegro de producción. La prueba opt-in se omite en `npm test` ordinario y se ejecuta mediante ese comando.

Caso Mexicali–Yuma original: preparación incompleta por moneda desconocida; conserva seis pallets, CTPAT preferente y fecha de pickup. La prueba de persistencia usa moneda explícita sintética, no una suposición sobre el embarque real.

Estado: implementado y probado localmente/en entorno seguro. Pendientes revisión/publicación de PR, aprobación y habilitación. No desplegado, no utilizado con datos de negocio y no disponible efectivamente en ChatGPT por este cambio local.

Resultados locales del 17-nov: typecheck y build verdes; 488 pruebas Fr8Bid y 514 Bidware aprobadas (2 omisiones preexistentes de Bidware). La integración opt-in se ejecutó aparte y pasó; en la suite ordinaria figura como una omisión. Rateware: 3 pruebas de dominio, 3 del manejador real, 14 regresiones de escrituras condicionales, typecheck Deno y pruebas PostgreSQL de rollback/concurrencia en verde. Validación del contrato de autorización: cero errores. La advertencia de Vite por chunks superiores a 500 kB permanece.

Publicación. Historial: la sesión de Codex que hizo la implementación no pudo hacer el commit; Git respondió `approval required by policy, but AskForApproval is set to Never`. Dejó los cambios preparados y no intentó saltarse la política.

Estado actual: el propietario autorizó publicar. Una sesión de Claude Code repitió las pruebas sobre el mismo árbol, hizo el commit y el push de las dos ramas y abrió los dos PR en borrador (Rateware primero y Fr8Bid después, con enlace entre ambos). No se fusionó, no se desplegó ni se aplicó la migración. La conexión MCP real todavía no descubre las dos herramientas nuevas, porque eso requiere un despliegue con autorización aparte.
