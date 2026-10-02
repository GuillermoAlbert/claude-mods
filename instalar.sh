#!/usr/bin/env bash
# Instala o actualiza los mods de claude-mods para el usuario actual.
# Uso: bash instalar.sh            (instala o actualiza todos los mods del repo)
#      bash instalar.sh centinela  (solo los indicados)
set -euo pipefail

MARKET="claude-mods"
REPO="GuillermoAlbert/claude-mods"
RAW="https://raw.githubusercontent.com/$REPO/main/.claude-plugin/marketplace.json"

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

# 3. Qué mods instalar: los indicados, o todos los que lista el marketplace
if [ "$#" -gt 0 ]; then
  MODS=("$@")
else
  mapfile -t MODS < <(curl -fsSL "$RAW" | python3 -c 'import json,sys; print("\n".join(p["name"] for p in json.load(sys.stdin)["plugins"]))')
fi

# 4. Instalar los nuevos y actualizar los que ya estaban
INSTALLED="$(claude plugin list 2>/dev/null || true)"
for mod in "${MODS[@]}"; do
  if grep -q "$mod@$MARKET" <<<"$INSTALLED"; then
    claude plugin update "$mod@$MARKET"
  else
    claude plugin install "$mod@$MARKET"
  fi
  echo "✓ $mod"
done

echo "Listo. Abre una sesión nueva de Claude Code para cargarlos."
