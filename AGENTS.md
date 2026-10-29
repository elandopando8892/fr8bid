# Reglas del repositorio fr8bid

Aplican a toda persona o agente (Claude, Codex u otro) que trabaje aquí.

1. **Todo cambio entra por pull request a `main`.** Nada de commits directos a `main`, aunque las pruebas pasen.
2. **Cada hilo o sesión trabaja en su propia carpeta.** Un cambio de Fr8Bid sale de un checkout de este repositorio, no de otra carpeta (por ejemplo `fr8growth`).
3. **Producción = `main`.** Vercel despliega `main`; no se usa `vercel deploy --prod` ni ningún paquete de `.artifacts` como fuente de un despliegue.
4. **Un solo frente.** Los módulos de Bidware viven en `src/bidware`; el repositorio `bidware` queda congelado y cualquier cambio de esas pantallas se hace aquí.
5. **Un solo backend.** Todo código de Edge Functions y migraciones de rateware-prod va por PR al repositorio `rateware`; desde aquí no se despliegan funciones ni se aplican migraciones.
6. **Escrituras reales solo con aprobación por acción del propietario** (`FR8BID_ESCRITURAS_REALES`); adjudicar, entregar a Rateware y avisar al carrier se hacen únicamente desde la Mesa.
7. Antes de abrir el PR: `npm run typecheck`, `npm test` y `npx vite build` en verde.
