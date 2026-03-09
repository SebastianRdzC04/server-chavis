import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI || "mongodb://mongo:27017/chavis";

const soundDataSchema = new mongoose.Schema(
  {
    vrms: { type: Number, required: true },
    db_rel: { type: Number, required: true },
    db_spl: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  {
    collection: "data",
  }
);

// Index por timestamp para queries eficientes
soundDataSchema.index({ timestamp: -1 });
soundDataSchema.index({ userId: 1, timestamp: -1 });

export const SoundDataModel = mongoose.model("SoundData", soundDataSchema);

// Exportar modelos
export { UserModel } from "./models/UserModel";
export { RoomModel } from "./models/RoomModel";
export { CalibrationModel } from "./models/CalibrationModel";
export { StudyModel } from "./models/StudyModel";

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`[DB] Connected to MongoDB at ${MONGO_URI}`);
  } catch (error) {
    console.error("[DB] Connection error:", error);
    process.exit(1);
  }
}
