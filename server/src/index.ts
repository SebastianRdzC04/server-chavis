import http from "http";
import { Server } from "socket.io";
import { connectDB, SoundDataModel } from "./db";
import { SoundDataRaw } from "./types";

const PORT = Number(process.env.PORT) || 1100;

const httpServer = http.createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", service: "chavis-socketio" }));
});

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

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

  socket.on("data", async (raw: string) => {
    const parsed = parseTabData(raw);
    if (!parsed) return;

    try {
      const doc = await SoundDataModel.create({
        vrms: parsed.vrms,
        db_rel: parsed.db_rel,
        db_spl: parsed.db_spl,
      });

      // Re-emit to all connected clients (including sender)
      io.emit("data:new", {
        vrms: parsed.vrms,
        db_rel: parsed.db_rel,
        db_spl: parsed.db_spl,
        timestamp: doc.timestamp,
      });
    } catch (error) {
      console.error("[DB] Error saving data:", error);
    }
  });

  // Endpoint para obtener los últimos N registros (historial)
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

  socket.on("disconnect", () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

async function main() {
  await connectDB();

  httpServer.listen(PORT, () => {
    console.log(`[SERVER] Socket.IO server running on port ${PORT}`);
  });
}

main().catch(console.error);
