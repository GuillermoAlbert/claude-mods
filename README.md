# claude-mods

Mods para Claude Code: plugins de *function hooks* en TypeScript que se ejecutan dentro de Claude Code.

> Los mods son **acceso anticipado**: solo cargan con `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` y la API puede cambiar entre versiones (hechos con Claude Code 2.1.287).

## Instalar

En cada máquina o LXC donde uses Claude Code, con el mismo usuario con el que lo ejecutas:

```bash
curl -fsSL https://raw.githubusercontent.com/GuillermoAlbert/claude-mods/main/instalar.sh | bash
```

El script activa los mods en `~/.claude/settings.json`, añade este repo como marketplace e instala los mods. Para actualizar, vuelve a ejecutarlo.

Todos los LXC de golpe, desde el host de Proxmox:

```bash
for id in $(pct list | awk 'NR>1 && $2=="running" {print $1}'); do
  pct exec "$id" -- bash -c "curl -fsSL https://raw.githubusercontent.com/GuillermoAlbert/claude-mods/main/instalar.sh | bash"
done
```

## Mods

### centinela

Una banda encima del prompt:

```
Sesión ▓▓▓▓▓░░░ 62% ↻2h05 · Semana ▓▓░░░░░░ 31% ↻3d 4h · Fable ▓░░░░░░░ 18% · Ctx ▓▓▓▓░░░░ 54% · ● caché 41:20
```

- **Límites**: sesión de 5 h, semana y cualquier otro límite que informe tu cuenta (p. ej. Fable), con barra, porcentaje y tiempo hasta el reinicio. Verde < 70 %, ámbar < 90 %, rojo a partir de ahí.
- **Contexto**: cuánto ocupa la conversación en la ventana del modelo.
- **Semáforo de caché**: cuenta atrás desde la última respuesta. Verde, ámbar en el último 25 % y rojo cuando ha caducado (al contestar se vuelve a cargar todo el contexto).
- **Avisos** al pasar del 80 % y del 95 % de cada límite, una vez por periodo.
- En pantallas estrechas quita las barras. `/centinela` muestra u oculta la banda.

Ajustes (en `/config`):

| Ajuste | Valores | Por defecto |
| --- | --- | --- |
| `cacheTtl` | `auto`, `1h`, `5m` | `auto`: 1 h con suscripción; 5 min sin límites de suscripción o con la sesión agotada (créditos) |
| `avisos` | sí / no | sí |

## Desarrollo

```bash
claude plugin validate plugins/centinela
claude plugin test plugins/centinela
```

Para probar cambios sin instalar: `claude --plugin-dir ./plugins/centinela`.

## Pendiente

1. ~~Banda de uso y caché~~ (`centinela`)
2. Dieta de contexto: frenar lecturas de archivos y logs enormes
3. Traspaso ordenado (`HANDOFF.md` + prompt) antes de quedarse sin contexto, sin cuota o sin caché, y aviso al móvil
4. Progreso de plan: fases, subagentes y estimación de tiempo
5. Escudo de datos: seudonimización local y reversible de DNI, IBAN, teléfonos y secretos
