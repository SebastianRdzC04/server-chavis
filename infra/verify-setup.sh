#!/bin/bash

# Script de verificación del entorno Docker para Chavis Sound Monitor

set -e

echo "========================================"
echo "Chavis Sound Monitor - Docker Setup"
echo "========================================"
echo ""

# Verificar si Docker está instalado
echo "[1/5] Verificando Docker..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker no está instalado"
    echo "   Instala Docker Desktop desde: https://www.docker.com/products/docker-desktop"
    exit 1
fi
echo "✅ Docker instalado: $(docker --version)"

# Verificar si Docker está corriendo
echo ""
echo "[2/5] Verificando Docker daemon..."
if ! docker info &> /dev/null; then
    echo "❌ Docker daemon no está corriendo"
    echo "   Inicia Docker Desktop y vuelve a ejecutar este script"
    exit 1
fi
echo "✅ Docker daemon corriendo"

# Verificar si docker compose está disponible
echo ""
echo "[3/5] Verificando Docker Compose..."
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose no está disponible"
    exit 1
fi
echo "✅ Docker Compose disponible: $(docker compose version)"

# Verificar archivo .env
echo ""
echo "[4/5] Verificando archivo .env..."
if [ ! -f .env ]; then
    echo "⚠️  Archivo .env no encontrado, creando desde .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✅ Archivo .env creado"
        echo "   IMPORTANTE: Edita el archivo .env y cambia los JWT secrets antes de usar en producción"
    else
        echo "❌ Archivo .env.example no encontrado"
        exit 1
    fi
else
    echo "✅ Archivo .env existe"
fi

# Verificar puertos disponibles
echo ""
echo "[5/5] Verificando puertos disponibles..."
PORTS=(1100 1101 1102)
PORT_NAMES=("Backend" "Frontend" "MongoDB")
ALL_PORTS_AVAILABLE=true

for i in "${!PORTS[@]}"; do
    PORT=${PORTS[$i]}
    NAME=${PORT_NAMES[$i]}
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "⚠️  Puerto $PORT ($NAME) está en uso"
        ALL_PORTS_AVAILABLE=false
    else
        echo "✅ Puerto $PORT ($NAME) disponible"
    fi
done

if [ "$ALL_PORTS_AVAILABLE" = false ]; then
    echo ""
    echo "⚠️  Algunos puertos están en uso. Puedes:"
    echo "   - Detener los servicios que usan esos puertos"
    echo "   - Cambiar los puertos en docker-compose.yml"
fi

echo ""
echo "========================================"
echo "Verificación completada"
echo "========================================"
echo ""
echo "Para iniciar los servicios, ejecuta:"
echo "  docker compose up -d --build"
echo ""
echo "Para ver los logs:"
echo "  docker compose logs -f"
echo ""
echo "Para detener los servicios:"
echo "  docker compose down"
echo ""
