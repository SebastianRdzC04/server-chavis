import { Router, Request, Response } from "express";
import { StudyModel } from "../db";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Obtener estudios de una habitación
router.get("/room/:roomId", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { roomId } = req.params;

    const studies = await StudyModel.find({ roomId, userId })
      .sort({ createdAt: -1 })
      .populate("calibrationId", "vrmsAt60dB calibratedAt")
      .lean();

    res.json(studies);
  } catch (error) {
    console.error("[STUDIES] Get error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Obtener un estudio específico
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const study = await StudyModel.findOne({ _id: id, userId })
      .populate("calibrationId", "vrmsAt60dB calibratedAt")
      .populate("roomId", "name description")
      .lean();

    if (!study) {
      res.status(404).json({ error: "Study not found" });
      return;
    }

    res.json(study);
  } catch (error) {
    console.error("[STUDIES] Get by id error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Actualizar nombre y notas de un estudio
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { name, notes } = req.body;

    const updateData: { name?: string; notes?: string } = {};

    if (name !== undefined) {
      if (name.trim() === "") {
        res.status(400).json({ error: "Study name cannot be empty" });
        return;
      }
      updateData.name = name.trim();
    }

    if (notes !== undefined) {
      updateData.notes = notes.trim() || undefined;
    }

    const study = await StudyModel.findOneAndUpdate(
      { _id: id, userId },
      { $set: updateData },
      { new: true }
    ).lean();

    if (!study) {
      res.status(404).json({ error: "Study not found" });
      return;
    }

    res.json(study);
  } catch (error) {
    console.error("[STUDIES] Update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Eliminar un estudio
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const study = await StudyModel.findOneAndDelete({ _id: id, userId });

    if (!study) {
      res.status(404).json({ error: "Study not found" });
      return;
    }

    res.json({ message: "Study deleted successfully" });
  } catch (error) {
    console.error("[STUDIES] Delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
