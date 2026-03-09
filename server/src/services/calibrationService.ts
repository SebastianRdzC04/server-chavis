import { Server as SocketServer, Socket } from "socket.io";
import { SystemCalibrationModel } from "../db";

interface CalibrationSession {
  sessionId: string;
  samples: number[];
  startTime: number;
  duration: number; // segundos
  timeoutId?: NodeJS.Timeout;
}

// Calibracion global del sistema — un solo valor activo, sin roomId ni userId
export class CalibrationService {
  private sessions: Map<string, CalibrationSession> = new Map();
  private io: SocketServer;

  // Umbral de estabilidad: desviacion estandar maxima permitida (5% del promedio)
  private readonly STABILITY_THRESHOLD = 0.05;
  private readonly DEFAULT_DURATION = 10; // segundos

  // Cache estatica en memoria del valor activo para acceso desde otros servicios
  private static _activeVrmsAt60dB: number | null = null;
  private static _activeCalibrationId: string | null = null;

  constructor(io: SocketServer) {
    this.io = io;
    // Cargar calibracion activa al inicio
    this.loadActiveCalibration();
  }

  private async loadActiveCalibration(): Promise<void> {
    try {
      const cal = await SystemCalibrationModel.findOne({ isActive: true })
        .sort({ calibratedAt: -1 })
        .lean();
      if (cal) {
        CalibrationService._activeVrmsAt60dB = cal.vrmsAt60dB;
        CalibrationService._activeCalibrationId = (cal._id as any).toString();
        console.log(
          `[CALIBRATION] Loaded system calibration: vrmsAt60dB=${cal.vrmsAt60dB.toFixed(6)}V`
        );
      } else {
        console.log("[CALIBRATION] No active system calibration found");
      }
    } catch (error) {
      console.error("[CALIBRATION] Error loading active calibration:", error);
    }
  }

  getActiveVrmsAt60dB(): number | null {
    return CalibrationService._activeVrmsAt60dB;
  }

  static getActiveCalibrationId(): string | null {
    return CalibrationService._activeCalibrationId;
  }

  static getStaticActiveVrmsAt60dB(): number | null {
    return CalibrationService._activeVrmsAt60dB;
  }

  // Inicia una sesion de calibracion global — no requiere autenticacion
  startCalibration(socket: Socket): string {
    const sessionId = `system_${Date.now()}`;

    const session: CalibrationSession = {
      sessionId,
      samples: [],
      startTime: Date.now(),
      duration: this.DEFAULT_DURATION,
    };

    this.sessions.set(sessionId, session);

    // Emitir evento de inicio
    socket.emit("calibration:started", {
      sessionId,
      duration: this.DEFAULT_DURATION,
    });

    console.log(`[CALIBRATION] Started global session ${sessionId}`);

    // Timeout para finalizar automaticamente
    const timeoutId = setTimeout(() => {
      this.completeCalibration(socket, sessionId);
    }, this.DEFAULT_DURATION * 1000);

    session.timeoutId = timeoutId;

    return sessionId;
  }

  addSample(sessionId: string, vrms: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.samples.push(vrms);

    const elapsed = (Date.now() - session.startTime) / 1000;
    const progress = Math.min(100, (elapsed / session.duration) * 100);

    // Emitir progreso — el frontend escucha calibration:progress
    this.io.emit("calibration:progress", {
      sessionId,
      samplesCount: session.samples.length,
      currentVrms: vrms,
      progress,
    });
  }

  async completeCalibration(socket: Socket, sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      socket.emit("calibration:failed", { error: "Session not found" });
      return;
    }

    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
    }

    if (session.samples.length < 10) {
      socket.emit("calibration:failed", {
        error: "Insufficient samples collected",
      });
      this.sessions.delete(sessionId);
      return;
    }

    // Calcular estadisticas
    const mean = session.samples.reduce((a, b) => a + b, 0) / session.samples.length;
    const variance =
      session.samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      session.samples.length;
    const stdDev = Math.sqrt(variance);
    const stabilityRatio = stdDev / mean;
    const isValid = stabilityRatio < this.STABILITY_THRESHOLD;

    if (!isValid) {
      socket.emit("calibration:failed", {
        error: "Too much fluctuation in the signal",
        stdDeviation: stabilityRatio,
      });
      this.sessions.delete(sessionId);
      console.log(
        `[CALIBRATION] Session ${sessionId} failed: stability ratio ${(stabilityRatio * 100).toFixed(1)}%`
      );
      return;
    }

    try {
      // Desactivar calibraciones anteriores
      await SystemCalibrationModel.updateMany({}, { isActive: false });

      // Guardar nueva calibracion global
      const calibration = await SystemCalibrationModel.create({
        vrmsAt60dB: mean,
        samplesCount: session.samples.length,
        duration: session.duration,
        stdDeviation: stdDev,
        isActive: true,
      });

      // Actualizar cache estatica en memoria
      CalibrationService._activeVrmsAt60dB = mean;
      CalibrationService._activeCalibrationId = (calibration._id as any).toString();

      const duration = (Date.now() - session.startTime) / 1000;

      socket.emit("calibration:complete", {
        calibrationId: calibration._id,
        vrmsAt60dB: mean,
        samplesCount: session.samples.length,
        duration,
        stdDeviation: stdDev,
        isValid: true,
      });

      // Notificar a todos los clientes que la calibracion cambio
      this.io.emit("calibration:system-updated", {
        vrmsAt60dB: mean,
        calibratedAt: calibration.calibratedAt,
      });

      console.log(
        `[CALIBRATION] Global calibration saved. Vrms@60dB: ${mean.toFixed(6)}V`
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
    if (session && session.timeoutId) {
      clearTimeout(session.timeoutId);
    }
    this.sessions.delete(sessionId);
    console.log(`[CALIBRATION] Session ${sessionId} cancelled`);
  }

  getSession(sessionId: string): CalibrationSession | undefined {
    return this.sessions.get(sessionId);
  }

  // Calcula dB SPL a partir del vrms medido y el vrms de referencia a 60dB
  static calculateDbSPL(vrms: number, vrmsAt60dB: number): number {
    if (vrmsAt60dB <= 0 || vrms <= 0) return 0;
    return 60 + 20 * Math.log10(vrms / vrmsAt60dB);
  }
}
