import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI || "mongodb://mongo:27017/chavis";

const soundDataSchema = new mongoose.Schema(
  {
    vrms: { type: Number, required: true },
    db_rel: { type: Number, required: true },
    db_spl: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  {
    collection: "data",
  }
);

// Index por timestamp para queries eficientes
soundDataSchema.index({ timestamp: -1 });

export const SoundDataModel = mongoose.model("SoundData", soundDataSchema);

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`[DB] Connected to MongoDB at ${MONGO_URI}`);
  } catch (error) {
    console.error("[DB] Connection error:", error);
    process.exit(1);
  }
}
