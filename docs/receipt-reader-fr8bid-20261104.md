# Recibo de cotización en Fr8Bid — adaptación local

## Resultado y alcance

La pantalla de revisión de tarifas ofrece «Ver recibo» por registro. Lee `get_staging_receipt` mediante el cliente autenticado existente y `/api/funcion`; conserva recibo, registro, estado actual y referencia histórica del original. La ausencia confirmada, inconsistencia y fuente no disponible se muestran por separado. El recibo no aprueba tarifas, adjudica, descarga originales ni habilita envíos.

La excepción puntual del propietario autoriza a Codex a completar este bloque de producto y preparar el PR, sustituyendo únicamente para esta tarea la asignación de ejecutor de AGENTS.md, regla 7. No cambia esa regla para futuros trabajos ni utiliza o modifica Claude Kit. No se modifica autenticación Google, B1, configuración de B2, roles de usuarios, variables, Edge Functions o datos comerciales.

## Reutilización y decisión vigente

Se reutiliza el prototipo aprobado de recibos, adaptado al árbol `src/bidware`, al diálogo y a ES/EN existentes. Se conserva el DTO de Rateware `bidware.staging-receipt.v1`; `rate_staging.source_evidence` no se usa como fuente canónica. Frente a copiar la pantalla completa de Bidware o crear otro servicio/almacén, la adaptación pequeña conserva las correcciones posteriores de Fr8Bid, su proxy y sus reglas, sin dependencias nuevas ni costos de infraestructura. Bidware permanece congelado.

La clasificación efectiva de acciones migró a `src/bidware/lib/needs.ts`: se registra solo la nueva lectura allí; tanto navegador como proxy reutilizan esa clasificación. Las escrituras siguen requiriendo los controles existentes.

## Seguridad de la vista

- El servidor de Rateware resuelve el propietario desde la sesión y autoriza primero el registro. El navegador envía solo `stagingId`.
- Se valida el DTO exacto, UUIDs, autoridad histórica, correspondencia del registro/original, versión, SHA-256 y límite de 25 MiB. Datos malformados no se muestran como recibos válidos.
- La vista se desmonta al perder verificación, cambiar identidad, rol, fila u original. Revalidar la misma cuenta inicia una nueva lectura. Las respuestas tardías no restituyen evidencia retirada.
- Una lista en recarga, fallida, sin esa fila o con ID duplicado retira el lector. No se selecciona por posición.
- El botón es de lectura para Consulta; las acciones comerciales conservan sus permisos. No existen controles nuevos de escritura, descarga o envío.

## Dependencia y límites

Este PR depende del lector de Rateware [PR #187](https://github.com/elandopando8892/rateware/pull/187), que a su vez depende de la conciliación [PR #186](https://github.com/elandopando8892/rateware/pull/186). No desplegar el frontend como una capacidad operativa antes de revisar e integrar esa dependencia. El lector no inventa evidencia para los registros reales que no la tienen.

Las pruebas son locales con identidades, registros y respuestas sintéticas: no acreditan una sesión Google real, JWT/RLS productivos, un recibo genuino de XBF ni despliegue. El PR de Rateware conserva 354 alertas previas del contrato global, sin alertas nuevas del lector, y sigue requiriendo revisión; las pruebas locales no sustituyen ese gate.

Para preparar el PR sin generar un Preview automático, `vercel.json` deshabilita únicamente el despliegue Git de `codex/receipt-reader`. No se deshabilita main ni se cambian opciones compartidas. Referencia: [git.deploymentEnabled](https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled). No se ejecutan comandos de despliegue.

## Verificación y reversión

Las pruebas cubren el contrato y errores, sesión retirada, cambio de cuenta/fila/rol, revalidación de la misma cuenta, respuestas tardías, recarga, duplicados, lectura con escrituras apagadas y recorrido real del diálogo/pantalla con transporte simulado. Se reutiliza la UI existente sin cambiar logos, tipografías o estilos de marca.

Comprobaciones requeridas: `npm run typecheck`, `npm test`, `npm run test:bidware` y `npx vite build`. En Windows, ejecutar desde la carpeta física del worktree (`codex-data`) evita que Vite trate el HTML resuelto a través del enlace `codex-home` como un archivo fuera de su raíz. No se cambia el código para compensar esa ruta local.

Resultado local de esta adaptación: typecheck PASS; Vitest 233/233 (58 nuevas); módulo migrado 507 PASS, 2 omitidas, 0 fallidas; build PASS desde la ruta física; diff sin errores. Los once recorridos de interfaz usan React y DOM sintético con el transporte interceptado; no son una sesión Google ni una aceptación visual en navegador de escritorio/móvil. No se instalaron dependencias nuevas: se usó el lockfile existente.

La reversión consiste en revertir este único commit por PR. No hay datos ni migraciones que deshacer; los PR de Rateware tienen reversión independiente. Abrir este PR no autoriza fusionarlo ni publicar.
