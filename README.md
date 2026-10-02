# claude-mods

Mods para Claude Code: plugins de *function hooks* en TypeScript que se ejecutan dentro de Claude Code, en tu máquina.

> Los mods son **acceso anticipado**: solo cargan con `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` (el script lo activa) y la API puede cambiar entre versiones. Hechos y probados con Claude Code 2.1.287.

| Mod | Qué hace |
| --- | --- |
| [centinela](#centinela) | Banda con el uso de la sesión, la semana, el contexto y la cuenta atrás de la caché |
| [dieta](#dieta) | Frena lecturas de archivos enormes y recorta salidas gigantes |
| [traspaso](#traspaso) | Documento de traspaso y prompt para seguir antes de quedarse sin contexto, cuota o caché; avisos al móvil |
| [progreso](#progreso) | Fase del plan, barra por fases, subagentes, tiempo y estimación |
| [escudo](#escudo) | Oculta a Claude DNI, NIE, IBAN, teléfonos, emails y claves |

## Instalar y actualizar

En cada máquina o LXC donde uses Claude Code, con el mismo usuario con el que lo ejecutas (no hace falta repo por repo):

```bash
curl -fsSL https://raw.githubusercontent.com/GuillermoAlbert/claude-mods/main/instalar.sh | bash
```

Instala todos los mods del repo y actualiza los que ya tenías. Para actualizar, vuelve a ejecutarlo. Solo algunos: `bash instalar.sh centinela dieta`. Para quitar uno: `claude plugin uninstall escudo@claude-mods`.

Todos los LXC de golpe, desde el host de Proxmox:

```bash
for id in $(pct list | awk 'NR>1 && $2=="running" {print $1}'); do
  pct exec "$id" -- bash -c "curl -fsSL https://raw.githubusercontent.com/GuillermoAlbert/claude-mods/main/instalar.sh | bash"
done
```

Los ajustes de cada mod están en `/config` dentro de Claude Code.

## centinela

Una banda encima del prompt:

```
Sesión ▓▓▓▓▓░░░ 62% ↻2h05 · Semana ▓▓░░░░░░ 31% ↻3d 4h · Fable ▓░░░░░░░ 18% · Ctx ▓▓▓▓░░░░ 54% · ● caché 41:20
```

- Límites de la cuenta (sesión de 5 h, semana y cualquier otro que informe, como Fable) con barra, porcentaje y tiempo hasta el reinicio. Verde < 70 %, ámbar < 90 %, rojo a partir de ahí.
- Contexto ocupado y semáforo de caché: cuenta atrás desde la última respuesta, ámbar en el último 25 % y rojo cuando caduca.
- Avisos al pasar del 80 % y del 95 % de cada límite. `/centinela` muestra u oculta la banda.

| Ajuste | Por defecto |
| --- | --- |
| `cacheTtl` (`auto`, `1h`, `5m`) | `auto`: 1 h con suscripción; 5 min sin límites de suscripción o con la sesión agotada |
| `avisos` | sí |

## dieta

- Si Claude intenta leer entero un archivo de más de 100 KB, se le frena y se le pide buscar con Grep y leer por partes. Si insiste con la misma lectura, se le deja.
- Las salidas de herramientas de más de 20.000 caracteres se recortan conservando el principio y el final, con una nota para que filtre si necesita el centro. Claude Code ya guarda en un archivo las salidas enormes; esto cubre las intermedias.

| Ajuste | Por defecto |
| --- | --- |
| `maxLecturaKB` | 100 |
| `maxSalida` | 20000 |
| `modo` (`frenar`, `avisar`) | `frenar` |

## traspaso

Escribe un documento de traspaso (objetivo, estado, decisiones, lo pendiente de ti, próximos pasos y referencias) en `.claude/traspasos/traspaso_<fecha UTC>.md` y en `.claude/traspasos/ULTIMO.md`, copia al portapapeles el prompt para seguir y lo deja como aviso en la conversación:

```
Lee .claude/traspasos/ULTIMO.md y continúa el trabajo desde "Próximos pasos". …
```

Se dispara solo:

- **Contexto** al 85 %.
- **Límite** (5 h, semana…) al 95 %. Si hay un turno en marcha, espera a que termine.
- **Inactividad**: 50 min esperando tu respuesta o un permiso, antes de que caduque la caché de 1 h. El documento se escribe reutilizando la caché, así que sale barato.
- **A mano** con `/traspaso`.

Con `ntfy` configurado te llega un aviso al móvil cuando Claude te espera y cuando guarda un traspaso. Instala la app ntfy, suscríbete a un tema difícil de adivinar (p. ej. `guillermo-claude-x7k2`) y ponlo en el ajuste `ntfy`. También vale la URL de un ntfy propio.

| Ajuste | Por defecto |
| --- | --- |
| `umbralContexto` | 85 |
| `umbralCuota` | 95 |
| `minutosInactivo` (0 = no) | 50 |
| `ntfy` | vacío (sin avisos) |
| `carpeta` | `.claude/traspasos` |

Consejo: añade `.claude/traspasos/` a tu `.gitignore` global si no quieres que acaben en los commits.

## progreso

Cuando Claude trabaja con una lista de tareas, aparece encima del prompt:

```
Fase 4.2 / 9 ▓▓▓│▓▓▓│▓▓▓│▓▒░│░░░…  12/27 · 1h12 · quedan ~40–75 min · 2 subagentes · ⏸ esperando tu respuesta
▸ 4.2 Migrar los repositorios JPA
```

- Si las tareas empiezan por número (`4.2 …`, `Fase 3: …`) se agrupan por fases; si no, cuenta tareas.
- La estimación sale de lo que han tardado las tareas terminadas y se muestra como rango.
- `/progreso` abre un panel con todas las tareas y su tiempo; `/progreso ocultar`, `mostrar` y `reiniciar`.
- La banda desaparece 10 minutos después de terminar el plan.

## escudo

Antes de que Claude lea nada (tus mensajes, archivos, salidas de comandos, correos de conectores), cambia cada dato personal por un falso **válido, con el mismo formato y siempre el mismo**:

| Dato | Ejemplo real → falso |
| --- | --- |
| DNI / NIE | `12345678Z` → `85879853S` (letra correcta) |
| IBAN | `ES91 2100 0418 …` → `ES73 2100 5872 …` (válido, mismo banco) |
| Teléfono | `+34 612 345 678` → `+34 6xx xxx xxx` (móvil sigue siendo móvil) |
| Email | `ana.garcia@empresa.es` → `persona.k3m9qz@empresa.es` |
| Claves | `sk-ant-…`, `ghp_…`, `AKIA…` → mismo prefijo y longitud |

Cuando Claude ejecuta algo con un falso (un `grep`, una edición, un comando), el mod lo cambia por el real justo antes de ejecutarlo. La tabla de equivalencias vive solo en tu máquina. Los datos reales no salen nunca hacia Anthropic.

- Solo se tapan DNI, NIE e IBAN válidos, para no tocar referencias que se les parezcan.
- A las búsquedas web (WebFetch, WebSearch) no se les devuelven los reales. A los conectores sí, porque normalmente los necesitan (responder a un correo, por ejemplo).
- **Límites**: nombres y direcciones en texto libre no se detectan. Los teléfonos son números de 9 cifras que empiezan por 6–9, así que puede tapar algún número que no sea un teléfono (se restaura igual al ejecutar). En la pantalla verás los falsos en lo que lee Claude.
- `/escudo` dice cuántos datos ha ocultado. Cada tipo se puede desactivar en `/config`.

Para máxima seguridad, trabaja con datos anonimizados en desarrollo y deja el escudo como segunda barrera.

## Desarrollo

```bash
claude plugin validate plugins/<mod>
claude plugin test plugins/<mod>
claude --plugin-dir ./plugins/<mod>   # probar sin instalar
```
