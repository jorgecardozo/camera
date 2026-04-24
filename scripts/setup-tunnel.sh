#!/usr/bin/env bash
# Setup de Cloudflare Tunnel para exponer Vigilancia a internet.
#
# Requisitos:
#   - Cuenta gratuita en cloudflare.com
#   - Un dominio agregado a Cloudflare (nameservers apuntando a CF)
#   - cloudflared instalado (este script lo instala si no está)
#
# Uso:
#   bash scripts/setup-tunnel.sh
#
# Solo necesitás correr esto UNA vez. Después cloudflared arranca con pm2.

set -euo pipefail

TUNNEL_NAME="vigilancia"
LOCAL_PORT=3000

# ── 1. Instalar cloudflared ───────────────────────────────────────────────────
if ! command -v cloudflared &>/dev/null; then
  echo "Instalando cloudflared..."
  brew install cloudflared
else
  echo "cloudflared ya instalado: $(cloudflared --version)"
fi

# ── 2. Login (abre el browser para autenticar con tu cuenta de Cloudflare) ───
echo ""
echo "Paso 1: Iniciá sesión con tu cuenta de Cloudflare."
echo "Se va a abrir el browser. Seleccioná el dominio que querés usar."
echo ""
cloudflared login

# ── 3. Crear el túnel ────────────────────────────────────────────────────────
echo ""
echo "Paso 2: Creando el túnel '$TUNNEL_NAME'..."
if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
  echo "El túnel '$TUNNEL_NAME' ya existe, saltando creación."
else
  cloudflared tunnel create "$TUNNEL_NAME"
fi

# ── 4. Obtener el UUID del túnel ─────────────────────────────────────────────
TUNNEL_ID=$(cloudflared tunnel list --output json | python3 -c "
import json, sys
tunnels = json.load(sys.stdin)
for t in tunnels:
    if t['name'] == '$TUNNEL_NAME':
        print(t['id'])
        break
")

if [ -z "$TUNNEL_ID" ]; then
  echo "Error: no se pudo obtener el UUID del túnel."
  exit 1
fi

echo "UUID del túnel: $TUNNEL_ID"

# ── 5. Crear config.yml ──────────────────────────────────────────────────────
CONFIG_DIR="$HOME/.cloudflared"
CONFIG_FILE="$CONFIG_DIR/config.yml"

mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_FILE" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $CONFIG_DIR/$TUNNEL_ID.json

ingress:
  - service: http://localhost:$LOCAL_PORT
EOF

echo ""
echo "Configuración guardada en $CONFIG_FILE"

# ── 6. Instrucciones para el DNS ─────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Paso 3 (manual): Configurá el subdominio DNS."
echo ""
echo "Ejecutá este comando cambiando 'cam.TUDOMINIO.com' por el subdominio que querés:"
echo ""
echo "  cloudflared tunnel route dns $TUNNEL_NAME cam.TUDOMINIO.com"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 7. Agregar cloudflared a pm2 ─────────────────────────────────────────────
echo ""
echo "Paso 4: Agregando cloudflared al ecosystem de pm2..."
echo "Editá ecosystem.config.cjs y descomentá el bloque 'tunnel' si querés"
echo "que pm2 lo gestione junto con Next.js."
echo ""
echo "O podés correrlo manualmente para probar:"
echo "  cloudflared tunnel run $TUNNEL_NAME"
echo ""
echo "Setup completo."
