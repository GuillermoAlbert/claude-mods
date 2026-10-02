#!/usr/bin/env bash
# Instala o actualiza los mods de claude-mods para el usuario actual.
# Uso: bash instalar.sh            (instala todos)
#      bash instalar.sh centinela  (solo los indicados)
set -euo pipefail

MARKET="claude-mods"
REPO="GuillermoAlbert/claude-mods"
MODS=("${@:-centinela}")

command -v claude >/dev/null || { echo "No encuentro 'claude' en el PATH"; exit 1; }

# 1. Activar los mods (acceso anticipado) en ~/.claude/settings.json
SETTINGS="$HOME/.claude/settings.json"
mkdir -p "$HOME/.claude"
if command -v python3 >/dev/null; then
  python3 - "$SETTINGS" <<'EOF'
import json, os, sys
p = sys.argv[1]
s = json.load(open(p)) if os.path.exists(p) and os.path.getsize(p) else {}
s.setdefault("env", {})["CLAUDE_CODE_ENABLE_FUNCTION_HOOKS"] = "1"
json.dump(s, open(p, "w"), indent=2)
open(p, "a").write("\n")
EOF
elif command -v node >/dev/null; then
  node -e 'const fs=require("fs"),f=process.argv[1];const s=fs.existsSync(f)&&fs.statSync(f).size?JSON.parse(fs.readFileSync(f,"utf8")):{};s.env={...s.env,CLAUDE_CODE_ENABLE_FUNCTION_HOOKS:"1"};fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n")' "$SETTINGS"
else
  echo "Necesito python3 o node para editar $SETTINGS"; exit 1
fi
echo "✓ Mods activados en $SETTINGS"

# 2. Añadir o actualizar el marketplace
if claude plugin marketplace list 2>/dev/null | grep -q "$MARKET"; then
  claude plugin marketplace update "$MARKET"
else
  claude plugin marketplace add "$REPO"
fi

# 3. Instalar (o reinstalar para actualizar) cada mod
for mod in "${MODS[@]}"; do
  claude plugin install "$mod@$MARKET" || claude plugin update "$mod@$MARKET"
  echo "✓ $mod"
done

echo "Listo. Abre una sesión nueva de Claude Code para cargarlos."
