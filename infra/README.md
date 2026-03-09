# Chavis Sound Monitor - Docker Setup

Este directorio contiene la configuración de Docker Compose para ejecutar todos los servicios de Chavis.

## Servicios

- **mongo** (puerto 1102): MongoDB 7 para almacenamiento de datos
- **server** (puerto 1100): Backend Node.js con Express + Socket.IO
- **front** (puerto 1101): Frontend React servido por Nginx

## Variables de Entorno

Las variables de entorno se configuran en el archivo `.env` en este directorio.

Copia el archivo `.env.example` a `.env` y ajusta los valores según tu entorno:

```bash
cp .env.example .env
```

### Variables disponibles:

**MongoDB:**
- `MONGO_INITDB_DATABASE`: Nombre de la base de datos (default: chavis)

**Backend:**
- `PORT`: Puerto del servidor (default: 1100)
- `MONGO_URI`: URI de conexión a MongoDB (default: mongodb://mongo:27017/chavis)
- `JWT_ACCESS_SECRET`: Secret para tokens de acceso JWT
- `JWT_REFRESH_SECRET`: Secret para tokens de refresh JWT

**Frontend:**
- `VITE_API_URL`: URL del backend API (default: http://localhost:1100)

**IMPORTANTE:** Cambia los secrets JWT en producción por valores seguros y únicos.

## Comandos

### Iniciar todos los servicios

```bash
docker compose up -d
```

### Construir y iniciar (rebuild)

```bash
docker compose up -d --build
```

### Ver logs

```bash
# Todos los servicios
docker compose logs -f

# Un servicio específico
docker compose logs -f server
docker compose logs -f front
docker compose logs -f mongo
```

### Detener servicios

```bash
docker compose down
```

### Detener y eliminar volúmenes (⚠️ elimina datos de MongoDB)

```bash
docker compose down -v
```

### Verificar estado

```bash
docker compose ps
```

## Verificación de Servicios

Después de iniciar los servicios, verifica que estén funcionando:

1. **MongoDB**: `curl http://localhost:1102` (debe conectarse)
2. **Backend**: `curl http://localhost:1100` (debe devolver `{"status":"ok","service":"chavis-server"}`)
3. **Frontend**: Abre http://localhost:1101 en tu navegador

## Acceso a la Aplicación

- Frontend: http://localhost:1101
- Backend API: http://localhost:1100
- MongoDB: localhost:1102

## Network

Todos los servicios se ejecutan en la red `chavis-net` para comunicación interna.

## Volúmenes

- `mongo_data`: Persistencia de datos de MongoDB

## Troubleshooting

### Error: "Cannot connect to the Docker daemon"
Asegúrate de que Docker Desktop esté instalado y ejecutándose.

### Error de puerto en uso
Si algún puerto está ocupado, puedes cambiar los puertos expuestos en `docker-compose.yml`:
```yaml
ports:
  - "NUEVO_PUERTO:PUERTO_INTERNO"
```

### El frontend no se conecta al backend
Verifica que `VITE_API_URL` en `.env` apunte a la URL correcta del backend.

### Reconstruir un servicio específico
```bash
docker compose up -d --build server
```

## Desarrollo Local sin Docker

Si prefieres ejecutar servicios individualmente:

1. **MongoDB**: Instala MongoDB localmente o usa un servicio en la nube
2. **Backend**: 
   ```bash
   cd ../server
   npm install
   npm run dev
   ```
3. **Frontend**:
   ```bash
   cd ../front
   npm install
   npm run dev
   ```

Asegúrate de configurar las variables de entorno apropiadas en archivos `.env` en cada directorio.
