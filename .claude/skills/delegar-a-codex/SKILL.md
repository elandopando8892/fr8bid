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

Sale con código 2 si el veredicto es `BLOQUEA`. El texto queda en `.agentes/registro/_actual.revision.md`. Claude lee cada hallazgo: arregla, o explica por qué no aplica.

Delegar una tarea (Codex en `workspace-write` solo dentro de `.agentes/trabajos/<nombre>`, rama `codex/<nombre>`):

```bash
npm run agentes:delegar -- --nombre arnes-pruebas-correo --tarea "Agrega pruebas a test/avisos-idioma.test.ts para el país sin idioma conocido"
```

El arnés hace el commit en la rama `codex/<nombre>`, corre la verificación completa y muestra el diffstat y la respuesta de Codex (`.agentes/registro/<nombre>.respuesta.md`).

Revisar e integrar ese trabajo:

```bash
npm run agentes:revisar -- --nombre arnes-pruebas-correo
npm run agentes:integrar -- --nombre arnes-pruebas-correo
```

`integrar` se niega si la rama actual es `main`, si la verificación o la revisión son de otro commit, si la verificación falló, si la revisión dio `BLOQUEA` o si el diff toca rutas sensibles (`.env`, `.claude/settings*`, `.codex/`, `.github/workflows/`, `vercel.json`, `AGENTS.md`, `CLAUDE.md`, `api/`, `src/servidor/`) sin `--acepto-sensibles`. Tras integrar vuelve a verificar la rama completa.

## Qué se delega y qué no

- Sí: pruebas, arneses, scripts, skills, refactors mecánicos con pruebas que los cubran, segunda opinión sobre un diff.
- No: nada de la lista de límites de `AGENTS.md` (desplegar, adjudicar, enviar, rateware-prod, secretos). Tampoco decisiones de producto: esas son de Jose.
- Una tarea = un resultado comprobable. Escribe en `--tarea` qué archivo, qué comportamiento y qué prueba demuestra que quedó.

## Si eres Codex leyendo este skill

Recibiste una tarea por este arnés. Trabaja solo en tu directorio, no hagas commit, corre `npm run typecheck` y `npm test`, y termina con `RESUMEN`, `ARCHIVOS`, `PRUEBAS`, `PENDIENTE`. Reporta los fallos tal cual; un «todo verde» falso hace que el trabajo se descarte.

## Prueba para el PR

Pega en la descripción del PR la salida final de `agentes:verificar` (pasos ✓/✗ y commit) y el veredicto con los hallazgos de `agentes:revisar`. No se suben archivos de evidencia al repo.
