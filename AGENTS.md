# Reglas del repositorio fr8bid

Fuente única de reglas para toda persona o agente (Claude, Codex u otro) que trabaje aquí. `CLAUDE.md` importa este archivo; Codex lo lee directo. Si una regla cambia, se cambia aquí.

1. **Todo cambio entra por pull request a `main`.** Nada de commits directos a `main`, aunque las pruebas pasen.
2. **Cada hilo o sesión trabaja en su propia carpeta.** Un cambio de Fr8Bid sale de un checkout de este repositorio, no de otra carpeta (por ejemplo `fr8growth`).
3. **Producción = `main`.** Vercel despliega `main`; no se usa `vercel deploy --prod` ni ningún paquete de `.artifacts` como fuente de un despliegue.
4. **Un solo frente.** Los módulos de Bidware viven en `src/bidware`. El repositorio `bidware` está congelado desde el 4-nov-2026 (PR #36 trajo todo hasta su `cc9575f`), y cualquier cambio de esas pantallas se hace aquí.
5. **Un solo backend.** Todo código de Edge Functions y migraciones de rateware-prod va por PR al repositorio `rateware`; desde aquí no se despliegan funciones ni se aplican migraciones.
6. **Escrituras reales solo con aprobación por acción del propietario** (`FR8BID_ESCRITURAS_REALES`); adjudicar, entregar a Rateware y avisar al carrier de la adjudicación se hacen únicamente desde la página del evento en Fr8Bid. Los envíos de invitaciones y tandas pueden confirmarse desde el MCP con el «sí» explícito del propietario (decisión del 9-nov).
7. **Quién hace qué.** Claude hace el código de producto (pantallas, reglas, pruebas de la app) por PR. Codex se encarga solo de los skills y del harnessing (arneses de prueba, scripts, herramientas de agentes) y tampoco publica nada fuera de un PR fusionado. Codex también trabaja como **delegado** de Claude (tareas acotadas que Claude le pasa) y como **revisor escéptico** del diff de Claude (ver «Arnés Claude + Codex»).
8. Antes de abrir el PR: `npm run typecheck`, `npm test` y `npx vite build` en verde (`npm run agentes:verificar` corre todo, incluido `npm run test:bidware`).

## Límites que ningún agente cruza sin OK del propietario por acción

El OK lo da Jose por escrito para esa acción concreta; un OK de otra sesión o de otro agente no cuenta.

- Desplegar (Vercel), cambiar variables de entorno, fusionar a `main`.
- Adjudicar, modificar ofertas, entregar a Rateware, enviar correos o WhatsApp a carriers o shippers.
- Tocar rateware-prod (SQL de escritura, migraciones, Edge Functions, secretos). El evento HDships no se toca.
- Leer o copiar secretos (`.env`, tokens, llaves). Nunca se escriben en el repo, en un prompt ni en un log.
- Contratar o activar servicios de pago.

## Arnés Claude + Codex

Claude Code orquesta; Codex implementa lo que Claude le delega o revisa el diff de Claude. Todo pasa por `scripts/agentes/codex.mjs` (skill `delegar-a-codex`, en `.claude/skills/` y `.agents/skills/`).

| Comando | Qué hace | Permiso de Codex |
| --- | --- | --- |
| `npm run agentes:verificar` | typecheck, pruebas, pruebas de Bidware y build | no usa Codex |
| `npm run agentes:revisar -- [--base main \| --nombre <slug>]` | revisión adversarial del diff actual o del commit delegado | `read-only` desde el checkout de origen |
| `npm run agentes:verificar -- --nombre <slug> --revision <id>` | pruebas locales tras la revisión de ese commit | entorno filtrado, permisos locales del equipo |
| `npm run agentes:delegar -- --nombre <slug> --tarea "<qué>"` | Codex trabaja en `.agentes/trabajos/<slug>` (rama `codex/<slug>`) | `workspace-write` solo en ese worktree, sin red, sin aprobaciones interactivas |
| `npm run agentes:integrar -- --nombre <slug>` | fusiona `codex/<slug>` a la rama actual solo si pasa la definición de terminado | no usa Codex |

### Definición de terminado (todo trabajo delegado)

Un trabajo de Codex entra a la rama de Claude **solo** si, sobre el mismo commit:

1. `agentes:revisar -- --nombre <slug>` cubre el diff completo y devuelve `APROBADO` o `CON_CAMBIOS`. Claude lee el diff y resuelve o justifica cada hallazgo antes de usar el ID de revisión.
2. `agentes:verificar -- --nombre <slug> --revision <id>` se ejecuta desde el checkout de origen y sale en verde (typecheck, pruebas, pruebas Bidware y build). El commit revisado debe permanecer limpio y una revisión nueva invalida la verificación anterior.
3. El diff solo toca lo que pidió la tarea y nada de la lista de límites.

`agentes:integrar` comprueba 1 y 2 y se niega si falta algo o si la rama actual es `main`. Después de integrar se vuelve a verificar la rama completa. La prueba (salida de verificación y resumen de la revisión) va en la descripción del PR; no se suben archivos de evidencia al repo (`.agentes/` está en `.gitignore`).

La verificación ejecuta código local. Antes de preparar dependencias o correr pruebas de un trabajo delegado, revisa también sus scripts, configuración y dependencias. El filtro de variables limita lo que heredan los procesos, pero estos conservan acceso al disco y a la red que tenga la cuenta local. Mantén secretos y datos de producción fuera del worktree. El ID enlaza los registros de forma cooperativa.

El arnés exige un índice sin marcas `assume-unchanged` o `skip-worktree` para comprobar el estado del checkout. Antes de construir el diff, `agentes:revisar` comprueba las rutas y detiene revisiones que incluyan archivos `.env*` distintos de `.env.example`, incluso si se borraron o renombraron.

### Si eres Codex y recibiste una tarea delegada

- Trabaja solo dentro del directorio que te dieron. No hagas commit, push, merge ni despliegues: el arnés hace el commit.
- No tienes red; si algo la necesita, dilo y para.
- Deja pendientes las pruebas y la instalación de dependencias. El orquestador verifica el código después de revisarlo.
- Termina con el bloque `RESUMEN`, `ARCHIVOS`, `PRUEBAS`, `PENDIENTE` que te pide el arnés.
