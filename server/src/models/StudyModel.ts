import mongoose from "mongoose";

const studySchema = new mongoose.Schema(
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
    calibrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Calibration",
      required: true,
    },
    // Metadata del estudio
    name: {
      type: String,
      required: true,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    // Datos del pico
    peakVrms: {
      type: Number,
    },
    peakDbSPL: {
      type: Number,
    },
    peakTimestamp: {
      type: Date,
    },
    // Datos RT60
    rt60Time: {
      type: Number, // segundos
    },
    endVrms: {
      type: Number,
    },
    endDbSPL: {
      type: Number,
    },
    // Estado del estudio
    status: {
      type: String,
      enum: ["recording", "completed", "failed"],
      default: "recording",
    },
  },
  {
    collection: "studies",
    timestamps: true,
  }
);

// Índices para búsquedas eficientes
studySchema.index({ roomId: 1, createdAt: -1 });
studySchema.index({ userId: 1 });
studySchema.index({ status: 1 });

export const StudyModel = mongoose.model("Study", studySchema);
