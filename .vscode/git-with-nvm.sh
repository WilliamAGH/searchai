#!/bin/bash
# Git wrapper that ensures correct Node environment for VSCode

# Ensure local binaries are on PATH
export PATH="$PWD/node_modules/.bin:$PATH"

# Load NVM if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Try other Node version managers if NVM not found
if ! command -v node >/dev/null 2>&1; then
  # Try FNM
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env --shell=bash)"
    fnm use >/dev/null 2>&1 || true
  fi
  # Try Volta
  if [ -d "$HOME/.volta/bin" ]; then
    export PATH="$HOME/.volta/bin:$PATH"
  fi
fi

# Use the project's Node version if .nvmrc exists
if [ -f ".nvmrc" ] && command -v nvm >/dev/null 2>&1; then
  nvm use >/dev/null 2>&1 || true
fi

# Set React test environment variables
export IS_REACT_ACT_ENVIRONMENT=true
export NODE_ENV=test

# Set default Convex deployment (scoped, not global)
export CONVEX_DEPLOYMENT="${CONVEX_DEPLOYMENT:-diligent-greyhound-240}"

# Execute git with all arguments
exec /usr/bin/git "$@"
