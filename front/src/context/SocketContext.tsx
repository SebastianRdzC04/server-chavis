import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { apiClient } from "../utils/api";
import type { SoundData } from "../types";

interface CalibrationProgress {
  samplesCount: number;
  currentVrms: number;
  progress: number; // 0-100
}

interface CalibrationComplete {
  calibrationId: string;
  vrmsAt60dB: number;
  samplesCount: number;
  duration: number;
  stdDeviation: number;
  isValid: boolean;
}

interface CalibrationFailed {
  error: string;
  stdDeviation?: number;
}

interface RT60Progress {
  phase: "waiting" | "measuring";
  currentVrms: number;
  currentDbSPL: number;
  peakVrms?: number;
  peakDbSPL?: number;
  elapsedTime?: number;
}

interface RT60Complete {
  studyId: string;
  peakVrms: number;
  peakDbSPL: number;
  rt60Time: number;
  endVrms: number;
  endDbSPL: number;
}

interface RT60Failed {
  error: string;
}

type SocketEventCallback = (data: any) => void;

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  authenticate: (userId: string) => void;
  selectRoom: (roomId: string) => void;
  startCalibration: (roomId: string) => void;
  cancelCalibration: () => void;
  startRT60Study: (roomId: string, calibrationId: string, name: string, notes?: string) => void;
  cancelRT60Study: () => void;
  on: (event: string, callback: SocketEventCallback) => void;
  off: (event: string, callback: SocketEventCallback) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within SocketProvider");
  }
  return context;
}

interface Props {
  children: ReactNode;
}

export function SocketProvider({ children }: Props) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:1100";
    
    // Crear conexión Socket.IO
    const newSocket = io(API_BASE_URL, {
      autoConnect: false, // No conectar automáticamente
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    // Event listeners para conexión
    newSocket.on("connect", () => {
      console.log("[Socket] Connected:", newSocket.id);
      setConnected(true);
    });

    newSocket.on("disconnect", (reason) => {
      console.log("[Socket] Disconnected:", reason);
      setConnected(false);
    });

    newSocket.on("connect_error", (error) => {
      console.error("[Socket] Connection error:", error);
    });

    setSocket(newSocket);

    // Cleanup al desmontar
    return () => {
      newSocket.close();
    };
  }, []);

  // Auto-conectar cuando hay un accessToken disponible
  useEffect(() => {
    const accessToken = apiClient.getAccessToken();
    if (socket && accessToken && !connected) {
      socket.connect();
    }
  }, [socket, connected]);

  function authenticate(userId: string) {
    if (!socket) return;
    socket.emit("user:authenticate", { userId });
  }

  function selectRoom(roomId: string) {
    if (!socket) return;
    socket.emit("room:select", { roomId });
  }

  function startCalibration(roomId: string) {
    if (!socket) return;
    socket.emit("calibration:start", { roomId });
  }

  function cancelCalibration() {
    if (!socket) return;
    socket.emit("calibration:cancel");
  }

  function startRT60Study(roomId: string, calibrationId: string, name: string, notes?: string) {
    if (!socket) return;
    socket.emit("study:start", { roomId, calibrationId, name, notes });
  }

  function cancelRT60Study() {
    if (!socket) return;
    socket.emit("study:cancel");
  }

  function on(event: string, callback: SocketEventCallback) {
    if (!socket) return;
    socket.on(event, callback);
  }

  function off(event: string, callback: SocketEventCallback) {
    if (!socket) return;
    socket.off(event, callback);
  }

  const value: SocketContextValue = {
    socket,
    connected,
    authenticate,
    selectRoom,
    startCalibration,
    cancelCalibration,
    startRT60Study,
    cancelRT60Study,
    on,
    off,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

// Tipos exportados para uso en componentes
export type {
  CalibrationProgress,
  CalibrationComplete,
  CalibrationFailed,
  RT60Progress,
  RT60Complete,
  RT60Failed,
  SoundData,
};
