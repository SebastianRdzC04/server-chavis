import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { connectDB, SoundDataModel, RoomModel } from "./db";
import { SoundDataRaw } from "./types";
import { verifyAccessToken } from "./utils/jwt";
import { CalibrationService } from "./services/calibrationService";
import { RT60Service } from "./services/rt60Service";

// Rutas
import authRoutes from "./routes/auth";
import roomRoutes from "./routes/rooms";
import calibrationRoutes from "./routes/calibrations";
import studyRoutes from "./routes/studies";

const PORT = Number(process.env.PORT) || 1100;

// Crear aplicación Express
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/", (_, res) => {
  res.json({ status: "ok", service: "chavis-server" });
});

// Montar rutas con prefijo /api
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/calibrations", calibrationRoutes);
app.use("/api/studies", studyRoutes);

// Crear servidor HTTP
const httpServer = http.createServer(app);

// Configurar Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Inicializar servicios
const calibrationService = new CalibrationService(io);
const rt60Service = new RT60Service(io);

// Map para asociar sockets con usuarios y habitaciones activas
const socketUsers = new Map<string, string>(); // socketId -> userId
const socketRooms = new Map<string, string>(); // socketId -> roomId
const socketCalibrationSessions = new Map<string, string>(); // socketId -> sessionId
const socketRT60Sessions = new Map<string, string>(); // socketId -> sessionId

function parseTabData(raw: string): SoundDataRaw | null {
  const parts = raw.trim().split(/\t+/);
  if (parts.length < 3) {
    console.warn("[PARSE] Invalid data format, expected 3 tab-separated values:", raw);
    return null;
  }

  const vrms = parseFloat(parts[0]);
  const db_rel = parseFloat(parts[1]);
  const db_spl = parseFloat(parts[2]);

  if (isNaN(vrms) || isNaN(db_rel) || isNaN(db_spl)) {
    console.warn("[PARSE] Non-numeric values received:", raw);
    return null;
  }

  return { vrms, db_rel, db_spl };
}

io.on("connection", (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  // Autenticación del usuario via socket
  socket.on("user:authenticate", (token: string) => {
    const payload = verifyAccessToken(token);
    if (payload) {
      socketUsers.set(socket.id, payload.userId);
      socket.emit("user:authenticated", { userId: payload.userId });
      console.log(`[WS] User ${payload.userId} authenticated on socket ${socket.id}`);
    } else {
      socket.emit("user:auth-failed", { error: "Invalid token" });
    }
  });

  // Seleccionar habitación activa
  socket.on("room:select", async (roomId: string) => {
    const userId = socketUsers.get(socket.id);
    if (!userId) {
      socket.emit("room:select-failed", { error: "Not authenticated" });
      return;
    }

    // Verificar que la habitación pertenece al usuario
    try {
      const room = await RoomModel.findOne({ _id: roomId, userId });
      if (!room) {
        socket.emit("room:select-failed", { error: "Room not found" });
        return;
      }

      socketRooms.set(socket.id, roomId);
      socket.emit("room:selected", { roomId });
      console.log(`[WS] User ${userId} selected room ${roomId}`);
    } catch (error) {
      console.error("[WS] Error selecting room:", error);
      socket.emit("room:select-failed", { error: "Database error" });
    }
  });

  // Recibir datos del IoT
  socket.on("data", async (raw: string) => {
    const parsed = parseTabData(raw);
    if (!parsed) return;

    const userId = socketUsers.get(socket.id);

    try {
      // Guardar en base de datos
      const doc = await SoundDataModel.create({
        vrms: parsed.vrms,
        db_rel: parsed.db_rel,
        db_spl: parsed.db_spl,
        userId: userId || undefined,
      });

      // Procesar en servicios activos
      const calibrationSessionId = socketCalibrationSessions.get(socket.id);
      if (calibrationSessionId) {
        calibrationService.addSample(calibrationSessionId, parsed.vrms);
      }

      const rt60SessionId = socketRT60Sessions.get(socket.id);
      if (rt60SessionId) {
        rt60Service.processSample(rt60SessionId, parsed.vrms);
      }

      // Calcular dB SPL si hay habitación seleccionada y calibración
      let calculatedDbSPL: number | null = null;
      const roomId = socketRooms.get(socket.id);
      if (roomId && userId) {
        try {
          const { CalibrationModel } = await import("./db");
          const calibration = await CalibrationModel.findOne({
            roomId,
            userId,
            isValid: true,
          })
            .sort({ calibratedAt: -1 })
            .lean();

          if (calibration) {
            calculatedDbSPL = CalibrationService.calculateDbSPL(parsed.vrms, calibration.vrmsAt60dB);
          }
        } catch (error) {
          // Silenciosamente continuar si no hay calibración
        }
      }

      // Re-emitir a todos los clientes conectados
      io.emit("data:new", {
        vrms: parsed.vrms,
        db_rel: parsed.db_rel,
        db_spl: parsed.db_spl,
        dbSPL: calculatedDbSPL,
        timestamp: doc.timestamp,
      });
    } catch (error) {
      console.error("[DB] Error saving data:", error);
    }
  });

  // Endpoint para obtener historial
  socket.on("data:history", async (limit: number = 100) => {
    try {
      const records = await SoundDataModel.find()
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      socket.emit("data:history", records.reverse());
    } catch (error) {
      console.error("[DB] Error fetching history:", error);
    }
  });

  // --- Eventos de calibración ---
  socket.on("calibration:start", (roomId: string) => {
    const userId = socketUsers.get(socket.id);
    if (!userId) {
      socket.emit("calibration:failed", { error: "Not authenticated" });
      return;
    }

    const sessionId = calibrationService.startCalibration(socket, roomId, userId);
    socketCalibrationSessions.set(socket.id, sessionId);
  });

  socket.on("calibration:cancel", () => {
    const sessionId = socketCalibrationSessions.get(socket.id);
    if (sessionId) {
      calibrationService.cancelCalibration(sessionId);
      socketCalibrationSessions.delete(socket.id);
    }
  });

  // --- Eventos de estudio RT60 ---
  socket.on("study:start", async (data: { roomId: string; name: string; notes?: string }) => {
    const userId = socketUsers.get(socket.id);
    if (!userId) {
      socket.emit("study:failed", { error: "Not authenticated" });
      return;
    }

    const sessionId = await rt60Service.startStudy(
      socket,
      data.roomId,
      userId,
      data.name,
      data.notes
    );

    if (sessionId) {
      socketRT60Sessions.set(socket.id, sessionId);
    }
  });

  socket.on("study:cancel", () => {
    const sessionId = socketRT60Sessions.get(socket.id);
    if (sessionId) {
      rt60Service.cancelStudy(sessionId);
      socketRT60Sessions.delete(socket.id);
    }
  });

  // Desconexión
  socket.on("disconnect", () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);

    // Limpiar sesiones activas
    const calibrationSessionId = socketCalibrationSessions.get(socket.id);
    if (calibrationSessionId) {
      calibrationService.cancelCalibration(calibrationSessionId);
    }

    const rt60SessionId = socketRT60Sessions.get(socket.id);
    if (rt60SessionId) {
      rt60Service.cancelStudy(rt60SessionId);
    }

    // Limpiar maps
    socketUsers.delete(socket.id);
    socketRooms.delete(socket.id);
    socketCalibrationSessions.delete(socket.id);
    socketRT60Sessions.delete(socket.id);
  });
});

async function main() {
  await connectDB();

  httpServer.listen(PORT, () => {
    console.log(`[SERVER] Server running on port ${PORT}`);
    console.log(`[SERVER] HTTP API available at http://localhost:${PORT}`);
    console.log(`[SERVER] WebSocket available at ws://localhost:${PORT}`);
  });
}

main().catch(console.error);
