import { Router, Request, Response } from "express";
import { RoomModel } from "../db";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Obtener todas las habitaciones del usuario
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const rooms = await RoomModel.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    res.json(rooms);
  } catch (error) {
    console.error("[ROOMS] Get error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Obtener una habitación específica
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const roomId = req.params.id;

    const room = await RoomModel.findOne({ _id: roomId, userId }).lean();

    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    res.json(room);
  } catch (error) {
    console.error("[ROOMS] Get by id error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Crear nueva habitación
router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, description } = req.body;

    if (!name || name.trim() === "") {
      res.status(400).json({ error: "Room name is required" });
      return;
    }

    const room = await RoomModel.create({
      userId,
      name: name.trim(),
      description: description?.trim() || undefined,
    });

    res.status(201).json(room);
  } catch (error) {
    console.error("[ROOMS] Create error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Actualizar habitación
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const roomId = req.params.id;
    const { name, description } = req.body;

    const updateData: { name?: string; description?: string } = {};

    if (name !== undefined) {
      if (name.trim() === "") {
        res.status(400).json({ error: "Room name cannot be empty" });
        return;
      }
      updateData.name = name.trim();
    }

    if (description !== undefined) {
      updateData.description = description.trim() || undefined;
    }

    const room = await RoomModel.findOneAndUpdate(
      { _id: roomId, userId },
      { $set: updateData },
      { new: true }
    ).lean();

    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    res.json(room);
  } catch (error) {
    console.error("[ROOMS] Update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Eliminar habitación
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const roomId = req.params.id;

    const room = await RoomModel.findOneAndDelete({ _id: roomId, userId });

    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    res.json({ message: "Room deleted successfully" });
  } catch (error) {
    console.error("[ROOMS] Delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
