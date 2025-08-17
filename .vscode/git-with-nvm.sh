#!/bin/bash
# Git wrapper that ensures correct Node environment for VSCode

# Load NVM if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Use the project's Node version
if [ -f ".nvmrc" ]; then
  nvm use
fi

# Set React environment variable
export IS_REACT_ACT_ENVIRONMENT=true

# Execute git with all arguments
exec /usr/bin/git "$@"
