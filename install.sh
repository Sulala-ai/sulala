#!/bin/bash
set -euo pipefail

# Sulala Agent OS — one-line install (macOS and Linux)
# Usage: curl -fsSL --proto '=https' --tlsv1.2 https://sulala.ai/install.sh | bash
#        Or from npm package: bash node_modules/@sulala-ai/agent-os/install.sh

BOLD='\033[1m'
ACCENT='\033[38;2;99;102;241m'      # indigo
INFO='\033[38;2;136;146;176m'
SUCCESS='\033[38;2;34;197;94m'
WARN='\033[38;2;234;179;8m'
ERROR='\033[38;2;239;68;68m'
MUTED='\033[38;2;100;116;139m'
NC='\033[0m'

SULALA_VERSION="${SULALA_VERSION:-latest}"
REPO_NAME="@sulala-ai/agent-os"
NODE_MIN_MAJOR=18
DASHBOARD_PORT="${PORT:-3010}"
ORIGINAL_PATH="${PATH:-}"

TMPFILES=()
cleanup_tmpfiles() {
  local f
  for f in "${TMPFILES[@]:-}"; do
    rm -rf "$f" 2>/dev/null || true
  done
}
trap cleanup_tmpfiles EXIT

mktempfile() {
  local f
  f="$(mktemp)"
  TMPFILES+=("$f")
  echo "$f"
}

# Parse optional args (e.g. --version=0.1.8)
for arg in "$@"; do
  case "$arg" in
    --version=*) SULALA_VERSION="${arg#--version=}" ;;
  esac
done

DOWNLOADER=""
detect_downloader() {
  if command -v curl &>/dev/null; then
    DOWNLOADER="curl"
    return 0
  fi
  if command -v wget &>/dev/null; then
    DOWNLOADER="wget"
    return 0
  fi
  ui_error "Missing downloader (curl or wget required)"
  exit 1
}

download_file() {
  local url="$1"
  local output="$2"
  if [[ -z "$DOWNLOADER" ]]; then
    detect_downloader
  fi
  if [[ "$DOWNLOADER" == "curl" ]]; then
    curl -fsSL --proto '=https' --tlsv1.2 --retry 3 --retry-delay 1 --retry-connrefused -o "$output" "$url"
    return
  fi
  wget -q --https-only --secure-protocol=TLSv1_2 --tries=3 --timeout=20 -O "$output" "$url"
}

ui_info() {
  echo -e "${MUTED}·${NC} $*"
}

ui_warn() {
  echo -e "${WARN}!${NC} $*"
}

ui_success() {
  echo -e "${SUCCESS}✓${NC} $*"
}

ui_error() {
  echo -e "${ERROR}✗${NC} $*"
}

ui_section() {
  echo ""
  echo -e "${ACCENT}${BOLD}$*${NC}"
}

detect_os_or_die() {
  OS="unknown"
  if [[ "${OSTYPE:-}" == "darwin"* ]]; then
    OS="macos"
  elif [[ "${OSTYPE:-}" == "linux-gnu"* ]] || [[ -n "${WSL_DISTRO_NAME:-}" ]]; then
    OS="linux"
  fi
  if [[ "$OS" == "unknown" ]]; then
    ui_error "Unsupported operating system"
    echo "This installer supports macOS and Linux (including WSL)."
    echo "For Windows: irm https://sulala.ai/install.ps1 | iex"
    exit 1
  fi
  ui_success "Detected: $OS"
}

is_root() {
  [[ "$(id -u)" -eq 0 ]]
}

require_sudo() {
  if [[ "$OS" != "linux" ]]; then
    return 0
  fi
  if is_root; then
    return 0
  fi
  if command -v sudo &>/dev/null; then
    if ! sudo -n true &>/dev/null 2>&1; then
      ui_info "Administrator privileges required; enter your password"
      sudo -v
    fi
    return 0
  fi
  ui_error "sudo is required for system installs on Linux"
  exit 1
}

# On macOS, Xcode Command Line Tools are required (git, clang, etc.). Homebrew and Node need them.
check_macos_xcode_clt() {
  [[ "$OS" != "macos" ]] && return 0
  if xcode-select -p &>/dev/null && xcrun -f clang &>/dev/null 2>&1; then
    ui_success "Xcode Command Line Tools found"
    return 0
  fi
  ui_error "Xcode Command Line Tools are required on macOS (for git and build tools)."
  echo "  Install them by running:"
  echo "    xcode-select --install"
  echo "  Complete the installer dialog, then re-run this script."
  if [[ -r /dev/tty && -w /dev/tty ]]; then
    ui_info "Opening the installer..."
    xcode-select --install 2>/dev/null || true
  fi
  exit 1
}

refresh_shell_command_cache() {
  hash -r 2>/dev/null || true
}

node_major_version() {
  if ! command -v node &>/dev/null; then
    return 1
  fi
  local version major
  version="$(node -v 2>/dev/null || true)"
  major="${version#v}"
  major="${major%%.*}"
  if [[ "$major" =~ ^[0-9]+$ ]]; then
    echo "$major"
    return 0
  fi
  return 1
}

# Prefer Bun; fallback Node 18+
check_bun_or_node() {
  if command -v bun &>/dev/null; then
    ui_success "Bun $(bun -v 2>/dev/null || echo "found")"
    return 0
  fi
  if command -v node &>/dev/null; then
    local major
    major="$(node_major_version || true)"
    if [[ -n "$major" && "$major" -ge "$NODE_MIN_MAJOR" ]]; then
      ui_success "Node.js $(node -v) found"
      return 0
    else
      if [[ -n "$major" ]]; then
        ui_info "Node.js $(node -v) found, upgrading to v${NODE_MIN_MAJOR}+"
      else
        ui_info "Node.js not found or version could not be parsed; installing v${NODE_MIN_MAJOR}+"
      fi
      return 1
    fi
  else
    ui_info "Bun or Node.js not found, installing Node v${NODE_MIN_MAJOR}+"
    return 1
  fi
}

# Check Node.js version (18+) when not using Bun
check_node() {
  if command -v bun &>/dev/null; then
    ui_success "Bun $(bun -v 2>/dev/null || echo "found")"
    return 0
  fi
  if command -v node &>/dev/null; then
    local major
    major="$(node_major_version || true)"
    if [[ -n "$major" && "$major" -ge "$NODE_MIN_MAJOR" ]]; then
      ui_success "Node.js $(node -v) found"
      return 0
    else
      if [[ -n "$major" ]]; then
        ui_info "Node.js $(node -v) found, upgrading to v${NODE_MIN_MAJOR}+"
      else
        ui_info "Node.js not found or version could not be parsed; installing v${NODE_MIN_MAJOR}+"
      fi
      return 1
    fi
  else
    ui_info "Node.js not found, installing it now"
    return 1
  fi
}

# Ensure this session uses Homebrew's node (macOS)
ensure_macos_node_active() {
  [[ "$OS" != "macos" ]] && return 0
  command -v bun &>/dev/null && return 0
  local brew_node_prefix=""
  if command -v brew &>/dev/null; then
    brew_node_prefix="$(brew --prefix node@20 2>/dev/null || true)"
    if [[ -z "$brew_node_prefix" ]]; then
      brew_node_prefix="$(brew --prefix node 2>/dev/null || true)"
    fi
    if [[ -n "$brew_node_prefix" && -x "${brew_node_prefix}/bin/node" ]]; then
      export PATH="${brew_node_prefix}/bin:$PATH"
      refresh_shell_command_cache
    fi
  fi
  local major
  major="$(node_major_version || true)"
  if [[ -n "$major" && "$major" -ge "$NODE_MIN_MAJOR" ]]; then
    return 0
  fi
  local active_path active_version
  active_path="$(command -v node 2>/dev/null || echo "not found")"
  active_version="$(node -v 2>/dev/null || echo "missing")"
  ui_error "Node.js v${NODE_MIN_MAJOR}+ was installed but this shell is using ${active_version} (${active_path})"
  if [[ -n "$brew_node_prefix" ]]; then
    echo "Add to your shell profile and restart:"
    echo "  export PATH=\"${brew_node_prefix}/bin:\$PATH\""
  fi
  return 1
}

# Install Homebrew if missing (macOS)
install_homebrew() {
  if [[ "$OS" != "macos" ]]; then
    return 0
  fi
  if command -v brew &>/dev/null; then
    ui_success "Homebrew already installed"
    return 0
  fi
  ui_info "Homebrew not found, installing"
  if ! [[ -r /dev/tty && -w /dev/tty ]]; then
    ui_error "Cannot install Homebrew non-interactively. Install from https://brew.sh then re-run."
    exit 1
  fi
  local tmp
  tmp="$(mktempfile)"
  download_file "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh" "$tmp"
  /bin/bash "$tmp"
  if [[ -f "/opt/homebrew/bin/brew" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -f "/usr/local/bin/brew" ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
  ui_success "Homebrew installed"
}

# Install Node.js directly from nodejs.org (macOS fallback when Homebrew has no bottle)
install_node_direct_macos() {
  local node_ver node_arch base_url tarball node_dir
  ui_info "Installing Node.js from nodejs.org (Homebrew had no bottle for this macOS)"
  detect_downloader
  node_ver="$(curl -sL --proto '=https' --tlsv1.2 'https://nodejs.org/dist/index.json' 2>/dev/null | grep -o '"version":"v20[^"]*"' | head -1 | sed 's/"version":"//;s/"//g')"
  if [[ -z "$node_ver" ]]; then
    node_ver="v20.18.0"
  fi
  case "$(uname -m)" in
    arm64|aarch64) node_arch="darwin-arm64" ;;
    *) node_arch="darwin-x64" ;;
  esac
  base_url="https://nodejs.org/dist/${node_ver}"
  tarball="${node_ver}-${node_arch}.tar.gz"
  local tmpdir
  tmpdir="$(mktemp -d)"
  TMPFILES+=("$tmpdir")
  if ! download_file "${base_url}/${tarball}" "${tmpdir}/${tarball}"; then
    ui_error "Failed to download Node.js. Install manually from https://nodejs.org"
    exit 1
  fi
  if ! tar -xzf "${tmpdir}/${tarball}" -C "$tmpdir"; then
    ui_error "Failed to extract Node.js"
    exit 1
  fi
  node_dir="${HOME}/.local/node"
  mkdir -p "${HOME}/.local"
  rm -rf "${node_dir}"
  mv "${tmpdir}/${node_ver}-${node_arch}" "$node_dir"
  export PATH="${node_dir}/bin:$PATH"
  refresh_shell_command_cache
  ui_success "Node.js installed to ${node_dir}"
}

# Install Node.js (macOS: Homebrew, then direct download fallback; Linux: NodeSource)
install_node() {
  if [[ "$OS" == "macos" ]]; then
    ui_info "Installing Node.js via Homebrew"
    local brew_err
    brew_err="$(mktempfile)"
    if (brew install node@20 2>"$brew_err" || brew install node 2>>"$brew_err"); then
      brew link node@20 --overwrite --force 2>/dev/null || true
      if ensure_macos_node_active; then
        ui_success "Node.js installed"
        return 0
      fi
    fi
    if grep -q "no bottle available\|must be installed and in your PATH\|Error: git" "$brew_err" 2>/dev/null; then
      ui_warn "Homebrew could not install Node (no bottle or missing tools). Trying nodejs.org..."
      install_node_direct_macos
    else
      if ! ensure_macos_node_active; then
        ui_error "Node.js install failed. Install from https://nodejs.org and re-run."
        exit 1
      fi
    fi
  elif [[ "$OS" == "linux" ]]; then
    require_sudo
    ui_info "Installing Node.js via NodeSource"
    local tmp
    tmp="$(mktempfile)"
    if command -v apt-get &>/dev/null; then
      download_file "https://deb.nodesource.com/setup_20.x" "$tmp"
      if is_root; then
        bash "$tmp"
        apt-get install -y -qq nodejs
      else
        sudo -E bash "$tmp"
        sudo apt-get install -y -qq nodejs
      fi
    elif command -v dnf &>/dev/null; then
      download_file "https://rpm.nodesource.com/setup_20.x" "$tmp"
      if is_root; then
        bash "$tmp"
        dnf install -y -q nodejs
      else
        sudo bash "$tmp"
        sudo dnf install -y -q nodejs
      fi
    elif command -v yum &>/dev/null; then
      download_file "https://rpm.nodesource.com/setup_20.x" "$tmp"
      if is_root; then
        bash "$tmp"
        yum install -y -q nodejs
      else
        sudo bash "$tmp"
        sudo yum install -y -q nodejs
      fi
    else
      ui_error "Could not detect package manager. Install Node.js ${NODE_MIN_MAJOR}+ from https://nodejs.org"
      exit 1
    fi
    ui_success "Node.js installed"
  fi
}

# Detect NVM and warn if active Node is old
detect_nvm_and_warn() {
  command -v bun &>/dev/null && return 0
  local nvm_dir="${NVM_DIR:-}"
  if [[ -z "$nvm_dir" && -f "${HOME}/.nvm/nvm.sh" ]]; then
    nvm_dir="${HOME}/.nvm"
  fi
  if [[ -z "$nvm_dir" ]]; then
    return 0
  fi
  local node_path
  node_path="$(command -v node 2>/dev/null || true)"
  if [[ -n "$node_path" && "$node_path" == *".nvm"* ]]; then
    local major
    major="$(node_major_version || true)"
    if [[ -n "$major" && "$major" -lt "$NODE_MIN_MAJOR" ]]; then
      ui_warn "NVM detected with Node $(node -v); Sulala requires Node ${NODE_MIN_MAJOR}+ or Bun"
      echo "  nvm install ${NODE_MIN_MAJOR}"
      echo "  nvm use ${NODE_MIN_MAJOR}"
      echo "  nvm alias default ${NODE_MIN_MAJOR}"
      echo "Then restart your terminal and run the installer again."
      exit 1
    fi
  fi
}

print_banner() {
  echo -e "${ACCENT}${BOLD}"
  echo "  Sulala Agent OS Installer"
  echo -e "${NC}${INFO}  One-line install for macOS and Linux${NC}"
  echo ""
}

main() {
  print_banner
  detect_os_or_die

  ui_section "Preparing environment"

  check_macos_xcode_clt
  install_homebrew

  if ! check_node; then
    install_node
  fi

  detect_nvm_and_warn

  if [[ -d "${HOME}/.local/node/bin" ]]; then
    export PATH="${HOME}/.local/node/bin:$PATH"
  fi
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  refresh_shell_command_cache

  if ! check_node; then
    ui_error "Node.js ${NODE_MIN_MAJOR}+ or Bun is required."
    echo "  Install from https://nodejs.org or (macOS) brew install node@20"
    echo "  Or install Bun: https://bun.sh"
    exit 1
  fi

  ui_section "Installing Sulala Agent OS"

  local PKG_MGR=""
  if command -v bun &>/dev/null; then
    PKG_MGR="bun"
  elif command -v npm &>/dev/null; then
    PKG_MGR="npm"
  elif command -v pnpm &>/dev/null; then
    PKG_MGR="pnpm"
  else
    ui_error "bun, npm, or pnpm is required"
    exit 1
  fi

  ui_info "Installing $REPO_NAME (version: $SULALA_VERSION) globally..."
  if [[ "$PKG_MGR" == "bun" ]]; then
    if [[ "$SULALA_VERSION" == "latest" ]]; then
      bun add -g "$REPO_NAME"
    else
      bun add -g "${REPO_NAME}@${SULALA_VERSION}"
    fi
  else
    if [[ "$SULALA_VERSION" == "latest" ]]; then
      $PKG_MGR install -g "$REPO_NAME"
    else
      $PKG_MGR install -g "${REPO_NAME}@${SULALA_VERSION}"
    fi
  fi

  # Ensure global bin is on PATH for this script (bun installs to ~/.bun/bin by default)
  if [[ "$PKG_MGR" == "bun" ]]; then
    BUN_GLOBAL_BIN="${BUN_INSTALL:-$HOME/.bun/bin}"
    if [[ -d "$BUN_GLOBAL_BIN" ]]; then
      export PATH="$BUN_GLOBAL_BIN:$PATH"
    fi
  fi

  ui_section "Setting up Sulala Agent OS"
  ui_info "Running onboard..."
  sulala onboard

  # Check if default port is in use before starting (avoids EADDRINUSE after install)
  is_port_in_use() {
    local port="$1"
    if command -v lsof &>/dev/null; then
      lsof -i ":$port" &>/dev/null
      return
    fi
    if command -v ss &>/dev/null; then
      ss -tln 2>/dev/null | grep -q ":$port "
      return
    fi
    return 1
  }

  if is_port_in_use "$DASHBOARD_PORT"; then
    ui_warn "Port ${DASHBOARD_PORT} is already in use. Skipping auto-start."
    echo "  If a previous Sulala is running: sulala stop"
    echo "  To use a different port: PORT=3011 sulala start"
    echo "  Then open: http://127.0.0.1:3011"
    echo ""
    ui_success "Sulala Agent OS is installed."
    echo -e "  Start when ready: ${INFO}sulala start${NC} (or PORT=3011 sulala start)"
    echo "  View login token: sulala dashboard-token"
    echo "  CLI: sulala run <agent_id> <task> | sulala start | sulala stop"
    echo ""
  else
    ui_info "Starting server in background..."
    export PORT="${DASHBOARD_PORT}"
    sulala start --daemon

    echo ""
    ui_success "Sulala Agent OS is running."
    echo -e "  Dashboard: ${INFO}http://127.0.0.1:${DASHBOARD_PORT}${NC}"
    echo "  View login token: sulala dashboard-token"
    echo "  CLI: sulala run <agent_id> <task> | sulala start | sulala stop"
    echo ""
  fi
}

main
