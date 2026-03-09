import mongoose from "mongoose";

// Calibracion global del sistema — una sola entrada activa a la vez
// No pertenece a ningun usuario ni habitacion
const systemCalibrationSchema = new mongoose.Schema(
  {
    vrmsAt60dB: {
      type: Number,
      required: true,
    },
    samplesCount: {
      type: Number,
      required: true,
    },
    duration: {
      type: Number, // segundos
      required: true,
    },
    stdDeviation: {
      type: Number,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    calibratedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "system_calibrations",
  }
);

systemCalibrationSchema.index({ calibratedAt: -1 });

export const SystemCalibrationModel = mongoose.model(
  "SystemCalibration",
  systemCalibrationSchema
);
