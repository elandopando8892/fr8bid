---
name: delegar-a-codex
description: Delegar a Codex una tarea acotada de fr8bid, pedirle una revisión escéptica del diff actual, o integrar su trabajo solo si pasó pruebas y revisión. Úsalo para «que Codex lo haga», «pídele a Codex que revise», «segunda opinión» o «revisión adversarial».
---

# Delegar a Codex (arnés Claude Code + Codex)

Copia canónica: `.agents/skills/delegar-a-codex/SKILL.md`. La de `.claude/skills/` debe ser idéntica (lo comprueba `test/agentes.test.ts`). Reglas y definición de terminado: `AGENTS.md`, sección «Arnés Claude + Codex».

## Roles

- **Claude Code** orquesta: decide qué se delega, lee el diff de Codex, integra y abre el PR.
- **Codex** es delegado (implementa en su propio worktree) o revisor (solo lectura). Nunca hace commit, push, merge ni despliegues.

## Requisitos

`npm i -g @openai/codex` y `codex login` en el equipo. Sin Codex, `verificar` sigue funcionando; `revisar` y `delegar` avisan y salen.

## Recetas

Revisión escéptica del diff actual contra `main` (Codex en `read-only`, sin red):

```bash
npm run agentes:revisar -- --base main --enfoque "candados de adjudicación"
```

Sale con código 2 si el veredicto es `BLOQUEA` o el diff quedó incompleto. El comando muestra la ruta del informe. Claude lee cada hallazgo y lo resuelve o justifica.

Delegar una tarea (Codex en `workspace-write` solo dentro de `.agentes/trabajos/<nombre>`, rama `codex/<nombre>`):

```bash
npm run agentes:delegar -- --nombre arnes-pruebas-correo --tarea "Agrega pruebas a test/avisos-idioma.test.ts para el país sin idioma conocido"
```

El arnés hace el commit en la rama `codex/<nombre>` y muestra el diffstat y la respuesta de Codex (`.agentes/registro/<nombre>.respuesta.md`). Las pruebas esperan la revisión.

Desde el checkout de origen, revisa el trabajo:

```bash
npm run agentes:revisar -- --nombre arnes-pruebas-correo
```

Lee el diff y el informe antes de preparar dependencias o ejecutar código. Revisa los scripts de pruebas y de instalación y sus dependencias. Una vez resueltos o justificados los hallazgos, usa el ID que mostró `revisar`:

```bash
npm run agentes:verificar -- --nombre arnes-pruebas-correo --revision <id>
npm run agentes:integrar -- --nombre arnes-pruebas-correo
```

`verificar` exige una revisión completa del commit limpio. Una revisión nueva invalida las pruebas anteriores. Para rutas sensibles, ambos comandos requieren `--acepto-sensibles` después de la revisión correspondiente. `integrar` requiere la verificación verde de la revisión vigente y rechaza `main`. Tras integrar vuelve a verificar la rama completa.

Las pruebas locales heredan una lista acotada de variables y se ejecutan con los permisos de la cuenta local. Usa un worktree sin secretos ni datos de producción. El ID de revisión enlaza los registros de forma cooperativa y la lectura del diff sigue a cargo del orquestador.

## Qué se delega y qué no

- Sí: pruebas, arneses, scripts, skills, refactors mecánicos con pruebas que los cubran, segunda opinión sobre un diff.
- No: nada de la lista de límites de `AGENTS.md` (desplegar, adjudicar, enviar, rateware-prod, secretos). Tampoco decisiones de producto: esas son de Jose.
- Una tarea = un resultado comprobable. Escribe en `--tarea` qué archivo, qué comportamiento y qué prueba demuestra que quedó.

## Si eres Codex leyendo este skill

Recibiste una tarea por este arnés. Trabaja solo en tu directorio y deja el commit al arnés. Deja pendientes la instalación de dependencias y la ejecución de pruebas hasta que el orquestador revise tu commit. Termina con `RESUMEN`, `ARCHIVOS`, `PRUEBAS`, `PENDIENTE` e indica qué queda por verificar.

## Prueba para el PR

Pega en la descripción del PR la salida final de `agentes:verificar` (pasos ✓/✗ y commit) y el veredicto con los hallazgos de `agentes:revisar`. No se suben archivos de evidencia al repo.
