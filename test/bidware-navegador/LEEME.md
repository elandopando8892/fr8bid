# Pruebas de navegador traídas de Bidware

Son las pruebas de `bidware/tests` (navegador, laboratorios y fixtures) corriendo contra
Fr8Bid. Sirven para comprobar que lo que hacía Bidware sigue funcionando dentro de Fr8Bid
antes de congelar Bidware. No tocan producción: todo es sintético.

## Cómo correrlas

1. Arranca Fr8Bid con datos de prueba:
   `VITE_FR8BID_MODO=rateware VITE_RATEWARE_SUPABASE_URL=https://bidware-fixture.supabase.co VITE_RATEWARE_SUPABASE_ANON_KEY=fixture-anon npx vite --port 3300`
2. Para los laboratorios con «antes y después», ten copias de Bidware junto a `fr8bid`
   (o pon su ruta en `BIDWARE_BASELINE`):
   - `../bidware-base`: Bidware en 2c36972.
   - `../bidware-base-conciliacion`: Bidware en `9880850^` (conciliación de lote a mano).
3. `test/bidware-navegador/correr.sh [archivos]`. Las bitácoras quedan en `.test-output/navegador/`.

`adaptador.cjs` se carga antes de cada prueba: pasa cada llamada `/api/funcion?fn=X` por
`src/servidor/paso.ts` (el mismo filtro que producción) y luego se la entrega al fixture de la
prueba como si fuera la función de Supabase. `FR8BID_TRAZA=1` muestra las llamadas y
`FR8BID_FOTO=nombre` toma una captura cuando falla un paso.

## Cambios respecto a Bidware

- Rutas: `src/…` pasa a `src/bidware/…`, y `/rfx/<id>` pasa a `/rfx/<id>/detalle` (en Fr8Bid
  `/rfx/<id>` abre la página del evento).
- Textos: se usan los textos que Fr8Bid ya cambió en PRs aprobados (#23–31).
- `s15-mobile-tables`: las acciones de la fila están en el menú «Más ▾», así que se cuentan
  solo los controles visibles, y en 390 px la tabla puede caber sin desplazarse.

## Lo que no pasa, y por qué

- Ya fallaban en el propio Bidware: offer-comparison-export, queue-delivery-labels,
  queue-identity, queue-refresh, rate-review-acceptance, rfx-catalog-conflict, sprint1-recorrido.
- `batch-flow.browser`: espera un botón «Conciliar lote» que Bidware quitó en 9880850 (la
  conciliación pasó a ser automática). La prueba quedó vieja en Bidware; la versión actual es
  `batch-reconciliation.browser`, que sí pasa.
- `draft-preparation.browser`: el paso «changing RFx while pending» da el mismo resultado con el
  código de Bidware que con el de Fr8Bid (las otras 15 comprobaciones pasan).
- `cierre-guardas`: cerrar y entregar se hace en la página del evento (`EN_LA_MESA`).
