import { Server as SocketServer, Socket } from "socket.io";
import { StudyModel } from "../db";
import { CalibrationService } from "./calibrationService";

interface RT60Session {
  sessionId: string;
  studyId: string;
  roomId: string;
  userId: string;
  calibrationId: string;
  vrmsAt60dB: number;
  
  // Estados del proceso
  state: "waiting_peak" | "measuring_rt60" | "completed" | "failed";
  
  // Datos del baseline (antes del pico)
  baselineBuffer: number[];
  baselineMean: number;
  
  // Datos del pico
  peakVrms?: number;
  peakDbSPL?: number;
  peakTimestamp?: Date;
  
  // RT60
  targetVrms?: number; // vrms cuando haya caído 60dB
  rt60StartTime?: number;
  
  startTime: number;
  timeoutId?: NodeJS.Timeout;
}

export class RT60Service {
  private sessions: Map<string, RT60Session> = new Map();
  private io: SocketServer;

  // Configuración
  private readonly BASELINE_BUFFER_SIZE = 30; // últimas 30 muestras para baseline (~3s a 10Hz)
  private readonly PEAK_THRESHOLD_MULTIPLIER = 3; // pico debe ser 3x el baseline
  private readonly RT60_DROP_DB = 60; // caída de 60dB
  private readonly STABLE_THRESHOLD_TIME = 500; // ms consecutivos por debajo del target
  private readonly PEAK_TIMEOUT = 30000; // 30s para detectar pico
  private readonly RT60_TIMEOUT = 120000; // 120s total para completar

  constructor(io: SocketServer) {
    this.io = io;
  }

  async startStudy(
    socket: Socket,
    roomId: string,
    userId: string,
    studyName: string,
    notes?: string
  ): Promise<string | null> {
    try {
      // Usar la calibracion global del sistema en memoria
      const vrmsAt60dB = CalibrationService.getStaticActiveVrmsAt60dB();
      const calibrationId = CalibrationService.getActiveCalibrationId();

      if (vrmsAt60dB === null || calibrationId === null) {
        socket.emit("study:failed", { error: "No hay calibración del sistema activa" });
        return null;
      }

      // Crear el estudio en la base de datos
      const study = await StudyModel.create({
        roomId,
        userId,
        calibrationId,
        name: studyName,
        notes: notes || undefined,
        status: "recording",
      });

      const sessionId = `${userId}_${roomId}_${Date.now()}`;

      const session: RT60Session = {
        sessionId,
        studyId: study._id.toString(),
        roomId,
        userId,
        calibrationId: calibrationId,
        vrmsAt60dB: vrmsAt60dB,
        state: "waiting_peak",
        baselineBuffer: [],
        baselineMean: 0,
        startTime: Date.now(),
      };

      this.sessions.set(sessionId, session);

      // Timeout para detectar pico
      const timeoutId = setTimeout(() => {
        this.failStudy(sessionId, "No peak detected within timeout");
      }, this.PEAK_TIMEOUT);

      session.timeoutId = timeoutId;

      socket.emit("study:start", {
        sessionId,
        studyId: study._id,
      });

      console.log(`[RT60] Started study ${sessionId} for room ${roomId}`);

      return sessionId;
    } catch (error) {
      console.error("[RT60] Error starting study:", error);
      socket.emit("study:failed", { error: "Database error" });
      return null;
    }
  }

  processSample(sessionId: string, vrms: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.state === "waiting_peak") {
      this.handleWaitingPeak(session, vrms);
    } else if (session.state === "measuring_rt60") {
      this.handleMeasuringRT60(session, vrms);
    }
  }

  private handleWaitingPeak(session: RT60Session, vrms: number): void {
    // Mantener buffer de baseline
    session.baselineBuffer.push(vrms);
    if (session.baselineBuffer.length > this.BASELINE_BUFFER_SIZE) {
      session.baselineBuffer.shift();
    }

    // Calcular baseline promedio
    if (session.baselineBuffer.length >= 10) {
      session.baselineMean =
        session.baselineBuffer.reduce((a, b) => a + b, 0) / session.baselineBuffer.length;

      // Detectar pico
      const threshold = session.baselineMean * this.PEAK_THRESHOLD_MULTIPLIER;
      if (vrms > threshold) {
        this.handlePeakDetected(session, vrms);
      } else {
        // Emitir estado actual (fase "waiting")
        const currentDbSPL = CalibrationService.calculateDbSPL(vrms, session.vrmsAt60dB);
        this.io.emit("study:progress", {
          sessionId: session.sessionId,
          studyId: session.studyId,
          phase: "waiting",
          currentVrms: vrms,
          currentDbSPL,
        });
      }
    }
  }

  private handlePeakDetected(session: RT60Session, peakVrms: number): void {
    session.peakVrms = peakVrms;
    session.peakTimestamp = new Date();
    session.peakDbSPL = CalibrationService.calculateDbSPL(peakVrms, session.vrmsAt60dB);

    // Calcular target vrms (60dB por debajo del pico)
    // Formula: vrms_target = vrms_peak * 10^(-60/20) = vrms_peak / 1000
    session.targetVrms = peakVrms * Math.pow(10, -this.RT60_DROP_DB / 20);

    session.state = "measuring_rt60";
    session.rt60StartTime = Date.now();

    // Actualizar timeout
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
    }
    const timeoutId = setTimeout(() => {
      this.failStudy(session.sessionId, "RT60 measurement timeout");
    }, this.RT60_TIMEOUT);
    session.timeoutId = timeoutId;

    this.io.emit("study:peak-detected", {
      sessionId: session.sessionId,
      studyId: session.studyId,
      peakDbSPL: session.peakDbSPL.toFixed(1),
      timestamp: session.peakTimestamp,
    });

    console.log(
      `[RT60] Peak detected in session ${session.sessionId}: ${session.peakDbSPL.toFixed(1)} dB SPL`
    );
  }

  private lastBelowTargetTime: Map<string, number> = new Map();

  private handleMeasuringRT60(session: RT60Session, vrms: number): void {
    if (!session.targetVrms || !session.rt60StartTime) return;

    const currentDbSPL = CalibrationService.calculateDbSPL(vrms, session.vrmsAt60dB);
    const elapsedTime = (Date.now() - session.rt60StartTime) / 1000;

    // Calcular dB caídos desde el pico
    const dbDropped = session.peakDbSPL! - currentDbSPL;

    this.io.emit("study:progress", {
      sessionId: session.sessionId,
      studyId: session.studyId,
      phase: "measuring",
      currentVrms: vrms,
      currentDbSPL,
      dbDropped: dbDropped,
      elapsedTime: elapsedTime,
    });

    // Verificar si hemos alcanzado el target
    if (vrms < session.targetVrms) {
      const now = Date.now();
      const lastTime = this.lastBelowTargetTime.get(session.sessionId) || now;

      // Si ha estado por debajo del target por más de STABLE_THRESHOLD_TIME
      if (now - lastTime >= this.STABLE_THRESHOLD_TIME) {
        this.completeStudy(session, vrms, currentDbSPL);
      }

      this.lastBelowTargetTime.set(session.sessionId, lastTime);
    } else {
      // Reset del contador si vuelve a subir
      this.lastBelowTargetTime.set(session.sessionId, Date.now());
    }
  }

  private async completeStudy(session: RT60Session, endVrms: number, endDbSPL: number): Promise<void> {
    if (!session.rt60StartTime || !session.peakVrms || !session.peakDbSPL || !session.peakTimestamp) {
      return;
    }

    const rt60Time = (Date.now() - session.rt60StartTime) / 1000;

    try {
      // Actualizar el estudio en la base de datos
      await StudyModel.findByIdAndUpdate(session.studyId, {
        peakVrms: session.peakVrms,
        peakDbSPL: session.peakDbSPL,
        peakTimestamp: session.peakTimestamp,
        rt60Time,
        endVrms,
        endDbSPL,
        status: "completed",
      });

      this.io.emit("study:complete", {
        sessionId: session.sessionId,
        studyId: session.studyId,
        rt60Time,
        peakVrms: session.peakVrms,
        peakDbSPL: session.peakDbSPL,
        endVrms,
        endDbSPL,
      });

      console.log(
        `[RT60] Study ${session.sessionId} completed. RT60: ${rt60Time.toFixed(2)}s`
      );
    } catch (error) {
      console.error("[RT60] Error completing study:", error);
      this.failStudy(session.sessionId, "Database error");
    } finally {
      this.cleanup(session.sessionId);
    }
  }

  private async failStudy(sessionId: string, reason: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      await StudyModel.findByIdAndUpdate(session.studyId, {
        status: "failed",
      });

      this.io.emit("study:failed", {
        sessionId,
        studyId: session.studyId,
        error: reason,
      });

      console.log(`[RT60] Study ${sessionId} failed: ${reason}`);
    } catch (error) {
      console.error("[RT60] Error failing study:", error);
    } finally {
      this.cleanup(sessionId);
    }
  }

  cancelStudy(sessionId: string): void {
    this.failStudy(sessionId, "Cancelled by user");
  }

  private cleanup(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.timeoutId) {
      clearTimeout(session.timeoutId);
    }
    this.sessions.delete(sessionId);
    this.lastBelowTargetTime.delete(sessionId);
  }

  getSession(sessionId: string): RT60Session | undefined {
    return this.sessions.get(sessionId);
  }
}
