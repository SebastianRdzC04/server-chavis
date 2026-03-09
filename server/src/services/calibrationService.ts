import { Server as SocketServer, Socket } from "socket.io";
import { CalibrationModel } from "../db";

interface CalibrationSession {
  sessionId: string;
  roomId: string;
  userId: string;
  samples: number[];
  startTime: number;
  duration: number; // segundos
  intervalId?: NodeJS.Timeout;
}

export class CalibrationService {
  private sessions: Map<string, CalibrationSession> = new Map();
  private io: SocketServer;

  // Umbral de estabilidad: desviación estándar máxima permitida (5% del promedio)
  private readonly STABILITY_THRESHOLD = 0.05;
  private readonly DEFAULT_DURATION = 10; // segundos

  constructor(io: SocketServer) {
    this.io = io;
  }

  startCalibration(socket: Socket, roomId: string, userId: string): string {
    const sessionId = `${userId}_${roomId}_${Date.now()}`;

    const session: CalibrationSession = {
      sessionId,
      roomId,
      userId,
      samples: [],
      startTime: Date.now(),
      duration: this.DEFAULT_DURATION,
    };

    this.sessions.set(sessionId, session);

    // Emitir evento de inicio
    socket.emit("calibration:start", {
      sessionId,
      duration: this.DEFAULT_DURATION,
    });

    console.log(`[CALIBRATION] Started session ${sessionId} for room ${roomId}`);

    // Configurar timeout para finalizar automáticamente
    const timeoutId = setTimeout(() => {
      this.completeCalibration(socket, sessionId);
    }, this.DEFAULT_DURATION * 1000);

    session.intervalId = timeoutId;

    return sessionId;
  }

  addSample(sessionId: string, vrms: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.samples.push(vrms);

    const elapsed = (Date.now() - session.startTime) / 1000;
    const remaining = Math.max(0, session.duration - elapsed);

    // Emitir progreso
    this.io.emit("calibration:progress", {
      sessionId,
      sampleCount: session.samples.length,
      timeRemaining: remaining,
      currentVrms: vrms,
    });
  }

  async completeCalibration(socket: Socket, sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      socket.emit("calibration:failed", { error: "Session not found" });
      return;
    }

    // Limpiar timeout
    if (session.intervalId) {
      clearTimeout(session.intervalId);
    }

    if (session.samples.length < 10) {
      socket.emit("calibration:failed", {
        error: "Insufficient samples collected",
      });
      this.sessions.delete(sessionId);
      return;
    }

    // Calcular estadísticas
    const mean = session.samples.reduce((a, b) => a + b, 0) / session.samples.length;
    const variance =
      session.samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      session.samples.length;
    const stdDev = Math.sqrt(variance);

    // Validar estabilidad
    const stabilityRatio = stdDev / mean;
    const isValid = stabilityRatio < this.STABILITY_THRESHOLD;

    if (!isValid) {
      socket.emit("calibration:failed", {
        error: "Too much fluctuation in the signal",
        stabilityRatio: (stabilityRatio * 100).toFixed(1),
        threshold: (this.STABILITY_THRESHOLD * 100).toFixed(1),
      });
      this.sessions.delete(sessionId);
      console.log(
        `[CALIBRATION] Session ${sessionId} failed: stability ratio ${(stabilityRatio * 100).toFixed(1)}%`
      );
      return;
    }

    try {
      // Guardar en la base de datos
      const calibration = await CalibrationModel.create({
        roomId: session.roomId,
        userId: session.userId,
        vrmsAt60dB: mean,
        samplesCount: session.samples.length,
        duration: session.duration,
        stdDeviation: stdDev,
        isValid: true,
      });

      socket.emit("calibration:complete", {
        calibrationId: calibration._id,
        vrmsAt60dB: mean,
        samplesCount: session.samples.length,
        stabilityRatio: (stabilityRatio * 100).toFixed(1),
      });

      console.log(
        `[CALIBRATION] Session ${sessionId} completed successfully. Vrms@60dB: ${mean.toFixed(6)}V`
      );
    } catch (error) {
      console.error("[CALIBRATION] Database error:", error);
      socket.emit("calibration:failed", { error: "Database error" });
    } finally {
      this.sessions.delete(sessionId);
    }
  }

  cancelCalibration(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.intervalId) {
      clearTimeout(session.intervalId);
    }
    this.sessions.delete(sessionId);
    console.log(`[CALIBRATION] Session ${sessionId} cancelled`);
  }

  getSession(sessionId: string): CalibrationSession | undefined {
    return this.sessions.get(sessionId);
  }

  // Método para calcular dB SPL basado en calibración
  static calculateDbSPL(vrms: number, vrmsAt60dB: number): number {
    if (vrmsAt60dB === 0) return 0;
    const ratio = vrms / vrmsAt60dB;
    // Evitar log de números negativos o cero
    if (ratio <= 0) return 0;
    return 60 + 20 * Math.log10(ratio);
  }
}
