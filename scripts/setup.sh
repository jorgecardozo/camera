#!/usr/bin/env bash
# =============================================================================
# Vigilancia — Script de instalación completa
#
# Instala y configura todo lo necesario para correr el servidor de cámaras.
# Compatible con macOS (Homebrew) y Linux/Raspberry Pi (apt).
#
# Uso:
#   bash scripts/setup.sh
#
# Lo que hace:
#   1. Verifica/instala Node.js, Python3, FFmpeg, pm2
#   2. Instala dependencias npm
#   3. Configura la base de datos (Prisma)
#   4. Crea el entorno Python e instala OpenCV + YOLO
#   5. Compila la app (next build)
#   6. Arranca con pm2
# =============================================================================

set -euo pipefail

# ── Colores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✔${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
info() { echo -e "${BLUE}→${NC} $1"; }
err()  { echo -e "${RED}✖${NC} $1"; }
step() { echo -e "\n${BOLD}$1${NC}"; }

ERRORS=()

# ── Detectar OS ──────────────────────────────────────────────────────────────
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif grep -qi "raspberry\|raspbian" /proc/device-tree/model 2>/dev/null; then
        echo "rpi"
    elif [[ -f /etc/debian_version ]]; then
        echo "debian"
    else
        echo "unknown"
    fi
}

OS=$(detect_os)
info "Sistema detectado: $OS"

# ── Verificar que estamos en la raíz del proyecto ────────────────────────────
if [[ ! -f "package.json" ]] || ! grep -q '"name": "camera"' package.json; then
    err "Corré este script desde la raíz del proyecto (donde está package.json)."
    exit 1
fi

PROJECT_DIR="$(pwd)"

# =============================================================================
# PASO 1: Dependencias del sistema
# =============================================================================
step "1/6 — Verificando dependencias del sistema"

# ── Node.js ──────────────────────────────────────────────────────────────────
if command -v node &>/dev/null; then
    NODE_VERSION=$(node --version | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
    if [[ "$NODE_MAJOR" -ge 18 ]]; then
        ok "Node.js $NODE_VERSION"
    else
        warn "Node.js $NODE_VERSION detectado — se necesita v18 o superior"
        if [[ "$OS" == "macos" ]]; then
            info "Instalando Node.js via Homebrew..."
            brew install node
        elif [[ "$OS" == "rpi" || "$OS" == "debian" ]]; then
            info "Instalando Node.js 20 via NodeSource..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
        else
            err "Instalá Node.js 18+ manualmente desde https://nodejs.org"
            ERRORS+=("Node.js 18+ requerido")
        fi
    fi
else
    info "Node.js no encontrado. Instalando..."
    if [[ "$OS" == "macos" ]]; then
        brew install node
    elif [[ "$OS" == "rpi" || "$OS" == "debian" ]]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        err "Instalá Node.js 18+ manualmente desde https://nodejs.org"
        ERRORS+=("Node.js 18+ requerido")
    fi
fi

# ── Python3 ──────────────────────────────────────────────────────────────────
if command -v python3 &>/dev/null; then
    PY_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
    PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
    if [[ "$PY_MAJOR" -ge 3 && "$PY_MINOR" -ge 8 ]]; then
        ok "Python $PY_VERSION"
    else
        warn "Python $PY_VERSION detectado — se necesita 3.8+"
        ERRORS+=("Python 3.8+ requerido")
    fi
else
    info "Python3 no encontrado. Instalando..."
    if [[ "$OS" == "macos" ]]; then
        brew install python3
    elif [[ "$OS" == "rpi" || "$OS" == "debian" ]]; then
        sudo apt-get install -y python3 python3-pip python3-venv
    else
        err "Instalá Python 3.8+ manualmente"
        ERRORS+=("Python 3.8+ requerido")
    fi
fi

# ── FFmpeg ───────────────────────────────────────────────────────────────────
if command -v ffmpeg &>/dev/null; then
    ok "FFmpeg $(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')"
else
    info "FFmpeg no encontrado. Instalando..."
    if [[ "$OS" == "macos" ]]; then
        brew install ffmpeg
    elif [[ "$OS" == "rpi" || "$OS" == "debian" ]]; then
        sudo apt-get install -y ffmpeg
    else
        err "Instalá FFmpeg manualmente desde https://ffmpeg.org"
        ERRORS+=("FFmpeg requerido")
    fi
fi

# ── pm2 ──────────────────────────────────────────────────────────────────────
if command -v pm2 &>/dev/null; then
    ok "pm2 $(pm2 --version)"
else
    info "Instalando pm2..."
    npm install -g pm2
    ok "pm2 instalado"
fi

# ── cloudflared (opcional) ────────────────────────────────────────────────────
if command -v cloudflared &>/dev/null; then
    ok "cloudflared $(cloudflared --version 2>&1 | head -1)"
else
    warn "cloudflared no instalado (necesario solo para acceso por internet)"
    info "Para instalarlo después: bash scripts/setup-tunnel.sh"
fi

# =============================================================================
# PASO 2: Verificar .env.local
# =============================================================================
step "2/6 — Verificando configuración (.env.local)"

REQUIRED_VARS=("NEXTAUTH_SECRET" "NEXTAUTH_URL" "ENCRYPTION_KEY")
ENV_FILE=".env.local"

if [[ ! -f "$ENV_FILE" ]]; then
    warn ".env.local no encontrado — creando plantilla..."
    cat > "$ENV_FILE" <<'EOF'
# ──────────────────────────────────────────────
# Vigilancia — Variables de entorno
# Completá los valores marcados con <CAMBIAR>
# ──────────────────────────────────────────────

# Contraseña de login (vacío = sin autenticación)
APP_PASSWORD=<CAMBIAR>

# URL pública de la app (cambiá por tu dominio o IP local)
NEXTAUTH_URL=http://localhost:3000

# Secretos — generá con: openssl rand -base64 32
NEXTAUTH_SECRET=<CAMBIAR>

# Clave de cifrado para credenciales RTSP — generá con: openssl rand -hex 32
ENCRYPTION_KEY=<CAMBIAR>

# Base de datos
DATABASE_URL=file:./prisma/dev.db

# Retención de grabaciones
MAX_RECORDING_AGE_HOURS=72
MAX_RECORDINGS_GB=10
RECORDING_SEGMENT_MINUTES=30

# FFmpeg del sistema (en Raspberry Pi, descomentá esta línea)
# FFMPEG_PATH=/usr/bin/ffmpeg
EOF
    echo ""
    err "────────────────────────────────────────────────────────────"
    err "  ACCIÓN REQUERIDA: completá el archivo .env.local"
    err ""
    err "  Generá los secretos con estos comandos:"
    err "    NEXTAUTH_SECRET: openssl rand -base64 32"
    err "    ENCRYPTION_KEY:  openssl rand -hex 32"
    err ""
    err "  Después volvé a correr: bash scripts/setup.sh"
    err "────────────────────────────────────────────────────────────"
    exit 1
fi

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    value=$(grep "^${var}=" "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")
    if [[ -z "$value" || "$value" == "<CAMBIAR>" ]]; then
        MISSING_VARS+=("$var")
    fi
done

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
    err "Variables sin configurar en .env.local:"
    for v in "${MISSING_VARS[@]}"; do
        err "  - $v"
    done
    echo ""
    err "Completalas y volvé a correr el script."
    exit 1
fi

ok ".env.local configurado correctamente"

# En Raspberry Pi, sugerir FFMPEG_PATH si no está seteado
if [[ "$OS" == "rpi" ]]; then
    if ! grep -q "^FFMPEG_PATH=" "$ENV_FILE" 2>/dev/null || grep -q "^#.*FFMPEG_PATH" "$ENV_FILE"; then
        warn "Raspberry Pi detectada — descomentá FFMPEG_PATH=/usr/bin/ffmpeg en .env.local"
        warn "El ffmpeg-static incluido en npm no funciona en ARM64"
    fi
fi

# =============================================================================
# PASO 3: Dependencias npm + base de datos
# =============================================================================
step "3/6 — Instalando dependencias npm"

info "npm install..."
npm install
ok "Dependencias npm instaladas"

info "Configurando base de datos (prisma db push)..."
npx prisma db push
ok "Base de datos lista (prisma/dev.db)"

# =============================================================================
# PASO 4: Entorno Python
# =============================================================================
step "4/6 — Configurando entorno Python (detección de movimiento)"

if [[ ! -d ".venv" ]]; then
    info "Creando entorno virtual Python..."
    python3 -m venv .venv
    ok "Entorno virtual creado (.venv/)"
else
    ok "Entorno virtual ya existe (.venv/)"
fi

info "Instalando dependencias Python (OpenCV + YOLO)..."
info "Esto puede tardar varios minutos la primera vez..."

if [[ "$OS" == "rpi" ]]; then
    # En RPi instalar torch CPU-only para ahorrar espacio
    .venv/bin/pip install --upgrade pip --quiet
    .venv/bin/pip install opencv-python-headless ultralytics --quiet
    .venv/bin/pip install torch torchvision \
        --index-url https://download.pytorch.org/whl/cpu --quiet
else
    .venv/bin/pip install --upgrade pip --quiet
    .venv/bin/pip install -r requirements.txt --quiet
fi

# Verificar que OpenCV quedó bien
if .venv/bin/python3 -c "import cv2" 2>/dev/null; then
    CV_VER=$(.venv/bin/python3 -c "import cv2; print(cv2.__version__)")
    ok "OpenCV $CV_VER instalado"
else
    err "OpenCV no se instaló correctamente"
    ERRORS+=("OpenCV no se pudo instalar")
fi

if .venv/bin/python3 -c "import ultralytics" 2>/dev/null; then
    ok "YOLO (ultralytics) instalado"
else
    err "ultralytics no se instaló correctamente"
    ERRORS+=("ultralytics no se pudo instalar")
fi

# =============================================================================
# PASO 5: Build de Next.js
# =============================================================================
step "5/6 — Compilando la aplicación (next build)"

info "npm run build... (puede tardar 1-2 minutos)"
npm run build
ok "Build completado"

# =============================================================================
# PASO 6: Arrancar con pm2
# =============================================================================
step "6/6 — Arrancando servidor con pm2"

# Si ya está corriendo, reiniciar; si no, iniciar
if pm2 list | grep -q "vigilancia"; then
    info "Reiniciando proceso existente..."
    pm2 restart vigilancia
    ok "Servidor reiniciado"
else
    info "Arrancando servidor..."
    pm2 start ecosystem.config.cjs
    ok "Servidor iniciado"
fi

pm2 save
ok "Configuración de pm2 guardada"

# =============================================================================
# Resumen final
# =============================================================================
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [[ ${#ERRORS[@]} -gt 0 ]]; then
    echo -e "${YELLOW}Instalación completada con advertencias:${NC}"
    for e in "${ERRORS[@]}"; do
        warn "  $e"
    done
else
    echo -e "${GREEN}${BOLD}Instalación completa${NC}"
fi

echo ""
echo -e "  App corriendo en: ${BOLD}http://localhost:3000${NC}"
echo ""
echo -e "  Comandos útiles:"
echo -e "    pm2 logs vigilancia   — ver logs en vivo"
echo -e "    pm2 status            — ver estado"
echo -e "    pm2 restart vigilancia — reiniciar"
echo ""

# Arranque automático al encender
if ! pm2 startup 2>&1 | grep -q "already"; then
    echo -e "${YELLOW}Para que arranque automáticamente al encender:${NC}"
    echo -e "  Corré el comando que imprime: ${BOLD}pm2 startup${NC}"
    echo -e "  Luego: ${BOLD}pm2 save${NC}"
    echo ""
fi

# Tunnel
if ! command -v cloudflared &>/dev/null; then
    echo -e "${YELLOW}Para acceso desde internet (Cloudflare Tunnel):${NC}"
    echo -e "  bash scripts/setup-tunnel.sh"
    echo ""
fi

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
