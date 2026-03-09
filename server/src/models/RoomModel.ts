import mongoose from "mongoose";

const roomSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  {
    collection: "rooms",
    timestamps: true,
  }
);

// Índice para búsqueda eficiente por usuario
roomSchema.index({ userId: 1, createdAt: -1 });

export const RoomModel = mongoose.model("Room", roomSchema);
