# Empresa, contacto y Apollo desde la Mesa

## Resultado

La Mesa concentra la resolución de contactos en una cola por empresa. Una
coincidencia conocida inequívoca se vincula sin confirmación; una coincidencia
ambigua se elige en el mismo panel. Si falta un correo, se buscan candidatos
en Apollo y un administrador confirma el límite antes del enriquecimiento.
El resultado se guarda en Rateware y se reutiliza después de recargar.

El vínculo no acredita una revisión humana ni envía una invitación. El modo
simulado permanece identificado y no ejecuta Apollo ni persistencia real.

## Decisión y reutilización

Se conserva React/Vite, la Mesa y el backend de Rateware. Se reutilizan la
clasificación de cargos de Apollo, identidad del workspace, roles, proveedores
y patrones de navegación existentes. `vendors` sigue siendo la fuente de
verdad; el registro nuevo conserva candidatos y operaciones, no otro maestro.

Se compararon tres capacidades: edición directa de campos existentes, una
cola integrada con registro durable, y adoptar otro CRM. La primera no reserva
consumos ni recupera operaciones; otro CRM añadiría migración, mantenimiento y
una integración adicional. Se eligió la cola con persistencia en Rateware.

Referencias del benchmark:

- [HubSpot: asociaciones por dominio y excepciones](https://knowledge.hubspot.com/object-settings/automatically-create-and-associate-companies-with-contacts).
- [HubSpot: cola de trabajo](https://knowledge.hubspot.com/prospecting/use-the-prospecting-queue).
- [Apollo: búsqueda de personas](https://docs.apollo.io/reference/people-api-search).
- [Apollo: enriquecimiento y créditos](https://docs.apollo.io/reference/people-enrichment).

## Recorrido

1. Abrir Carriers e invitación en la Mesa y seleccionar una empresa.
2. Vincular automáticamente un contacto conocido confiable o resolver la ambigüedad.
3. Buscar candidatos si falta correo; se priorizan los cargos pertinentes.
4. Seleccionar una persona y confirmar empresa, alcance y límite de créditos.
5. Guardar resultado, aplicar el vínculo y avanzar a la siguiente empresa.

La selección y el filtro se guardan en la navegación, ligados a usuario,
organización, rol y evento. Recarga y regreso conservan el contexto; cambiar
de cuenta lo descarta, incluidas respuestas tardías. Las entradas «Resolver
contacto» y los botones de la cola comparten la misma selección.

El contacto actual se consulta después de operar. Un vínculo histórico no
acredita que su correo siga vigente o libre de restricciones.

## Integración y permisos

`POST /api/contactos-empresa` conserva el token del usuario y reenvía únicamente
acciones permitidas a `carrier-contacts-api` de Rateware. Los candados de ambos
servidores limitan las capacidades mostradas. La ruta antigua de revelado no
puede eludir el registro nuevo.

Acciones públicas: context, operation, resolve_known, choose_known, search,
prepare_reveal, confirm_reveal y apply_result. El servidor obtiene organización
y actor de la sesión verificada; los campos del navegador no conceden autoridad.
Viewer consulta. Operator/admin pueden vincular y guardar búsquedas cuando las
escrituras están habilitadas; preparar/confirmar créditos exige admin.

Rateware contiene la migración `20261112040830_carrier_contacts_apollo.sql`,
la función Edge y el RPC `carrier_contact_action`. Las tablas tienen RLS y no
son accesibles al navegador; sólo service_role ejecuta el RPC. El registro de
autorizaciones incluye las ocho acciones humanas y el RPC interno con huellas
estáticas revisadas.

Estados: draft → processing → needs_link → completed; uncertain impide repetir
un consumo cuyo resultado se desconoce. La reserva se confirma antes de Apollo.
Los cambios de selección vencen confirmaciones anteriores; el actor, empresa,
persona, política y vencimiento quedan ligados a la operación.

La búsqueda puede devolver nombre parcial y una empresa anterior. Se muestra
la empresa reportada y se verifican ID, dominio corporativo, dominio del correo
y email_status verified antes de vincular. Telefonía, correo personal y
waterfall están desactivados. La ausencia de correo no acredita consumo cero;
se conserva la referencia del proveedor cuando está disponible.

Los resultados se conservan aunque se archive o elimine la empresa. Eso no
permite aplicarlos a una empresa restringida. Eliminar una empresa limpia sus
candidatos temporales y conserva el registro de operaciones con su identificador
original, organización y procedencia. La consulta por operación sigue disponible
al propietario para conciliación.

## Comprobación

Fr8Bid: `npm run agentes:verificar` ejecuta typecheck, Vitest, Bidware y build.
Los recorridos de navegador están en `test/browser/contactos-empresa.mjs` y
`test/browser/mesa-contactos.mjs`; reutilizan una instalación de Playwright
mediante `--playwright-module`. El primero recibe además `--rateware-root`.

El recorrido entre repositorios usa UI y HTTP reales, el core de Rateware y
PostgreSQL aislado. Identidad y respuestas Apollo son sintéticas. El segundo
comprueba navegación, entradas desde la Mesa, recarga, teclado y ancho móvil.
Recibos, capturas y salidas se conservan fuera de Git en `.agentes/`.

Rateware: pruebas `tests/carrier-contacts*.test.mjs`, Deno check y
`node tools/test-carrier-contacts-postgres.mjs`. El arnés PostgreSQL usa una
imagen local existente, red deshabilitada y almacenamiento temporal. Incluye
permisos, supresión, archivo/eliminación, confirmaciones y dos sesiones concurrentes.
El CI ejecuta contratos y el arnés aislado, además del replay general de migraciones.

## Activación y límites

Esta entrega no activa producción. Primero se libera el backend de Rateware
mediante su PR, migración y función; luego la interfaz y el gateway de Fr8Bid.
La activación requiere disponibilidad de Apollo en el backend, una política
`APOLLO_EMAIL_CREDIT_POLICY` verificada con id, max_credits entero de 1 a 100 y
expires_at vigente, y `FR8BID_ESCRITURAS_REALES=si` en ambos servidores.
Los despliegues automáticos de las ramas de estos PR quedan deshabilitados.

Quedan pendientes la autorización específica de publicación y la validación
con sesión, permisos y Apollo reales en una empresa de prueba. Una respuesta
perdida del proveedor exige conciliación; no se reconstruye ni se reintenta por
inferencia. Para revertir, se deshabilitan escrituras y se restaura el frontend
anterior autorizado, conservando los registros necesarios para conciliar.

Se mantiene la identidad visual existente y el fallback tipográfico documentado
en el proyecto; no se acredita disponibilidad de las fuentes oficiales de marca.
