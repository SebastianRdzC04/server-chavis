export interface SoundData {
  vrms: number;
  dbSPL: number | null;
  timestamp: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
}

export interface Room {
  _id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Calibration {
  _id: string;
  roomId: string;
  userId: string;
  vrmsAt60dB: number;
  samplesCount: number;
  duration: number;
  stdDeviation: number;
  isValid: boolean;
  calibratedAt: string;
}

export interface Study {
  _id: string;
  roomId: string;
  userId: string;
  calibrationId: string;
  name: string;
  notes?: string;
  peakVrms?: number;
  peakDbSPL?: number;
  peakTimestamp?: string;
  rt60Time?: number;
  endVrms?: number;
  endDbSPL?: number;
  status: "recording" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
}
