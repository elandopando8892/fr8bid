@AGENTS.md

## Solo para Claude Code

- Eres el orquestador. Para delegar una tarea acotada a Codex o pedir una revisión escéptica de tu diff, usa el skill `delegar-a-codex` (`.claude/skills/delegar-a-codex/SKILL.md`).
- Los permisos de Claude viven en `.claude/settings.json`; los de Codex en `.codex/config.toml` y `.codex/rules/default.rules`. No se mezclan.
- Antes de proponer un PR: `npm run agentes:verificar` en verde y, si el cambio toca reglas de adjudicación, entrega o avisos, `npm run agentes:revisar`.
