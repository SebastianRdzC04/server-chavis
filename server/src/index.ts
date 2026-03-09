import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { connectDB, SoundDataModel, RoomModel, SystemCalibrationModel } from "./db";
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

// Crear aplicacion Express
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

// Endpoint para obtener calibracion global del sistema
app.get("/api/system-calibration", async (_, res) => {
  try {
    const cal = await SystemCalibrationModel.findOne({ isActive: true })
      .sort({ calibratedAt: -1 })
      .lean();
    if (!cal) {
      res.json({ calibrated: false });
      return;
    }
    res.json({
      calibrated: true,
      vrmsAt60dB: cal.vrmsAt60dB,
      samplesCount: cal.samplesCount,
      stdDeviation: cal.stdDeviation,
      calibratedAt: cal.calibratedAt,
    });
  } catch (error) {
    console.error("[SERVER] Error fetching system calibration:", error);
    res.status(500).json({ error: "Database error" });
  }
});

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

  // Autenticacion del usuario via socket (solo para features que requieren usuario)
  // Acepta JWT string directo o { token }
  socket.on("user:authenticate", (payload: string | { token?: string }) => {
    let token: string | undefined;
    if (typeof payload === "string") {
      token = payload;
    } else if (typeof payload === "object" && payload !== null) {
      token = payload.token;
    }

    if (token) {
      const decoded = verifyAccessToken(token);
      if (decoded) {
        socketUsers.set(socket.id, decoded.userId);
        socket.emit("user:authenticated", { userId: decoded.userId });
        console.log(`[WS] User ${decoded.userId} authenticated on socket ${socket.id}`);
        return;
      }
    }

    socket.emit("user:auth-failed", { error: "Invalid token" });
  });

  // Seleccionar habitacion activa — requiere autenticacion
  socket.on("room:select", async (data: string | { roomId: string }) => {
    const roomId = typeof data === "string" ? data : data?.roomId;
    const userId = socketUsers.get(socket.id);

    if (!userId) {
      socket.emit("room:select-failed", { error: "Not authenticated" });
      return;
    }

    if (!roomId) {
      socket.emit("room:select-failed", { error: "roomId required" });
      return;
    }

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

  // Recibir datos del IoT (Arduino) — sin autenticacion requerida
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

      // Alimentar TODAS las sesiones de calibracion activas (el Arduino y el navegador son sockets distintos)
      for (const calibrationSessionId of socketCalibrationSessions.values()) {
        calibrationService.addSample(calibrationSessionId, parsed.vrms);
      }

      // Alimentar TODAS las sesiones RT60 activas
      for (const rt60SessionId of socketRT60Sessions.values()) {
        rt60Service.processSample(rt60SessionId, parsed.vrms);
      }

      // Calcular dB SPL con calibracion global del sistema
      const vrmsAt60dB = calibrationService.getActiveVrmsAt60dB();
      const dbSPL = vrmsAt60dB !== null
        ? CalibrationService.calculateDbSPL(parsed.vrms, vrmsAt60dB)
        : null;

      // Emitir a todos los clientes: solo vrms y dbSPL calculado
      io.emit("data:new", {
        vrms: parsed.vrms,
        dbSPL,
        timestamp: doc.timestamp,
      });
    } catch (error) {
      console.error("[DB] Error saving data:", error);
    }
  });

  // Historial reciente
  socket.on("data:history", async (limit: number = 100) => {
    try {
      const records = await SoundDataModel.find()
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      const vrmsAt60dB = calibrationService.getActiveVrmsAt60dB();

      const mapped = records.reverse().map((r) => ({
        vrms: r.vrms,
        dbSPL: vrmsAt60dB !== null
          ? CalibrationService.calculateDbSPL(r.vrms, vrmsAt60dB)
          : null,
        timestamp: r.timestamp,
      }));

      socket.emit("data:history", mapped);
    } catch (error) {
      console.error("[DB] Error fetching history:", error);
    }
  });

  // --- Calibracion global del sistema (no requiere autenticacion) ---
  socket.on("calibration:start", () => {
    const sessionId = calibrationService.startCalibration(socket);
    socketCalibrationSessions.set(socket.id, sessionId);
    console.log(`[WS] Global calibration started by socket ${socket.id}`);
  });

  socket.on("calibration:cancel", () => {
    const sessionId = socketCalibrationSessions.get(socket.id);
    if (sessionId) {
      calibrationService.cancelCalibration(sessionId);
      socketCalibrationSessions.delete(socket.id);
    }
  });

  // --- Eventos de estudio RT60 (requiere autenticacion) ---
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

  // Desconexion
  socket.on("disconnect", () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);

    const calibrationSessionId = socketCalibrationSessions.get(socket.id);
    if (calibrationSessionId) {
      calibrationService.cancelCalibration(calibrationSessionId);
    }

    const rt60SessionId = socketRT60Sessions.get(socket.id);
    if (rt60SessionId) {
      rt60Service.cancelStudy(rt60SessionId);
    }

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
