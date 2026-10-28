---
name: tablero
description: Tablero Kanvas del repo actual, compartido con la persona que aprueba y revisa las tareas. Usar cuando se hable del tablero, Kanvas, tareas, lo pendiente, «qué toca ahora», un ID de tarea como CP-01, o al empezar o terminar un trabajo apuntado en el tablero.
---

# Tablero (Kanvas)

Cada repo tiene su tablero de tareas. La persona lo ve en el navegador o en el móvil y los cambios aparecen al
segundo. El arranque de la sesión trae un resumen y, si no, `kanvas resumen`.

- **CLI:** `kanvas <comando>`. Elige solo el tablero de este repo y firma por ti; si dice que el repo no tiene
  tablero, no lo tiene: no lo crees. Si en esta máquina no existe el comando `kanvas`, aquí no hay tablero:
  decirlo y seguir sin él. Otra firma, por ejemplo un subagente: `KANVAS_AGENT=claude-<repo>-docs kanvas …`.
- **No editar `kanvas.json` a mano**, ni ejecutar `serve`, `service` o `init`: el servidor ya está en marcha.
- **Confidencialidad:** el tablero no tiene contraseña. Nunca escribir importes, nombres de clientes o
  proveedores, datos personales, contenido de documentos ni credenciales. Describir el trabajo, no los datos; el
  detalle va en un fichero del repo y la tarjeta enlaza su ruta.

## Flujo

```
propuesta -> por hacer -> en curso -> revisión -> hecho
proposed     todo         doing        review      done
```

Tú: `propose`/`batch`, `start`, `note`, `ask`, `finish` (resumen obligatorio), `pause`, `depend`; y, mientras no
esté aprobada, `edit`/`withdraw`/`undepend` de una propuesta. **Solo la persona** aprueba propuestas, cambia
tareas aprobadas, da por hechas las revisadas y activa YOLO: pídeselo en la conversación.

Si pide cambios en una propuesta, `status` la marca `(changes requested: …)` y `show ID` trae la petición:
revisarla con `edit ID … -m "qué cambié"`.

**YOLO** (lo activa la persona en una tarea): las tareas de las que depende quedan aprobadas; al hacer `finish`
de ellas pasan directas a hecho y puedes seguir con la siguiente `(YOLO)` sin preguntar. La tarea YOLO en sí va a
revisión. Una propuesta que enlaces a la cadena sigue esperando su aprobación.

## Protocolo de sesión

1. `kanvas status`: contar qué espera revisión, qué está listo, qué bloqueado y qué propuesto, y repetir cualquier
   pregunta marcada `(waiting for the human: …)`.
2. Elegir: si nombró una tarea, `show ID`; si no, `ready` y preguntar cuál.
3. `start ID -m "Plan: …"`. Leer la descripción y las notas; una nota que empieza por «Sent back:» es una
   devolución que hay que atender.
4. Trabajar con las normas del repo (`CLAUDE.md`/`AGENTS.md`). Hallazgos con `note ID "…"`; trabajo nuevo con
   `propose`, enlazado con `--deps`.
5. `finish ID --stdin` con un resumen que la persona pueda aceptar o devolver: qué cambia para ella, cómo se
   comprobó y qué debe mirar. Decirle que está en revisión y parar; la siguiente, solo si la pide.

Parar a medias: `pause ID -m "dónde lo dejo y por qué"`. Esperar respuesta: `ask ID "pregunta"`, hacer la misma
pregunta en la conversación y parar; cuando conteste, `note ID "…"` con la respuesta.

Trabajo que no estaba en el tablero pero lo merece (lo que quede pendiente al terminar, un fallo encontrado):
`propose`, no una lista en otro fichero.

## Fechas

Kanvas no tiene campo de fecha. Al principio del título o de la descripción: `📅 Desde el AAAA-MM-DD` (no
empezar antes) o `⏰ Antes del AAAA-MM-DD` (fecha límite). No empezar una tarea «desde» antes de su fecha sin
preguntar.

## Planificar

Proponer en un solo `batch` (todo o nada; todo llega como propuesta):

```bash
kanvas batch <<'EOF'
{"groups": [{"name": "Copias", "prefix": "CP"}],
 "tasks": [{"title": "Arreglar la copia", "group": "Copias", "desc": "Qué se consigue y cuándo está terminada"}]}
EOF
```

`deps` admite IDs o títulos de tareas anteriores del mismo batch. Cada `desc` dice qué consigue la tarea y qué
significa terminada. El prefijo del grupo empieza cada ID (`CP-01`); el ID de una tarea borrada puede volver, así
que comprobar el título antes de actuar sobre un ID viejo.

## Escribir para la persona

Lo lee entre otras cosas y sin tu contexto: empezar por lo que decide (qué consigue la propuesta, qué cambió el
resumen), dejar a mano lo que tiene que comprobar o decidir, en lenguaje claro y sin relleno técnico. En duda,
escribir menos; una `note` posterior puede añadir detalle.

## Comandos

| Comando | Para qué |
|---|---|
| `status` / `resumen` | Resumen completo / corto |
| `ready` / `blocked` | Listas para empezar / bloqueadas y por qué |
| `show ID` | Detalle, dependencias y notas |
| `list [ESTADO o GRUPO]` | Tareas por grupo |
| `start ID [-m NOTA]` | por hacer → en curso |
| `finish ID -m RESUMEN` (o `--stdin`) | en curso → revisión |
| `pause ID [-m NOTA]` | en curso → por hacer |
| `note ID TEXTO` / `ask ID PREGUNTA` | Nota / pregunta que espera a la persona |
| `propose GRUPO TÍTULO [DESC] [--deps ID …]` | Propuesta nueva (`-` = sin grupo) |
| `add-group NOMBRE [--prefix XX]` / `batch` | Grupo nuevo / muchas propuestas por JSON |
| `depend ID ON …` / `undepend ID ON …` | Dependencias |
| `edit ID [--title] [--group] [--desc] [-m]` / `withdraw ID …` | Revisar / retirar propuestas |
| `check` | Validar el tablero |

Los textos largos o con acentos van mejor con `--stdin` (heredoc) o `--file RUTA`. Si un comando falla, sale una
línea `Error:` con la regla: seguirla o preguntar. Saltarse una regla editando el fichero rompe la confianza en
el tablero.
