import mongoose from "mongoose";

const calibrationSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Voltaje de referencia a 60dB SPL
    vrmsAt60dB: {
      type: Number,
      required: true,
    },
    // Información de la captura
    samplesCount: {
      type: Number,
      required: true,
    },
    duration: {
      type: Number, // segundos
      required: true,
    },
    // Validación de estabilidad
    stdDeviation: {
      type: Number,
      required: true,
    },
    isValid: {
      type: Boolean,
      default: true,
    },
    calibratedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "calibrations",
  }
);

// Índices para búsquedas eficientes
calibrationSchema.index({ roomId: 1, calibratedAt: -1 });
calibrationSchema.index({ userId: 1 });

export const CalibrationModel = mongoose.model("Calibration", calibrationSchema);
