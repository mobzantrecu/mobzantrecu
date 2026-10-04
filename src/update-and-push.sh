#!/bin/bash

set -e

# PATH necesario para Homebrew + Node + Git
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

PROJECT_DIR="/Users/nicolas/benefits-collector"

cd "$PROJECT_DIR"

echo "========================================"
echo "Actualizando beneficios"
echo "$(date)"
echo "========================================"

echo ""
echo "→ PATH:"
echo "$PATH"

echo ""
echo "→ Node:"
which node
node --version

echo ""
echo "→ npm:"
which npm
npm --version

echo ""
echo "→ Ejecutando collector..."
npm start

echo ""
echo "→ Verificando cambios..."

git status --short

if git diff --quiet output/benefits.json; then
  echo ""
  echo "✓ No hubo cambios en benefits.json"
  exit 0
fi

echo ""
echo "→ Agregando cambios..."

git add output/benefits.json

git commit -m "chore: update benefits"

echo ""
echo "→ Subiendo a GitHub..."

git push

echo ""
echo "✓ Actualización completada"