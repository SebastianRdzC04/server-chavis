import { Router, Request, Response } from "express";
import { CalibrationModel } from "../db";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Obtener calibraciones de una habitación
router.get("/room/:roomId", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { roomId } = req.params;

    const calibrations = await CalibrationModel.find({ roomId, userId })
      .sort({ calibratedAt: -1 })
      .lean();

    res.json(calibrations);
  } catch (error) {
    console.error("[CALIBRATIONS] Get error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Obtener calibración más reciente de una habitación
router.get("/room/:roomId/latest", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { roomId } = req.params;

    const calibration = await CalibrationModel.findOne({ roomId, userId, isValid: true })
      .sort({ calibratedAt: -1 })
      .lean();

    if (!calibration) {
      res.status(404).json({ error: "No calibration found" });
      return;
    }

    res.json(calibration);
  } catch (error) {
    console.error("[CALIBRATIONS] Get latest error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Obtener una calibración específica
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const calibration = await CalibrationModel.findOne({ _id: id, userId }).lean();

    if (!calibration) {
      res.status(404).json({ error: "Calibration not found" });
      return;
    }

    res.json(calibration);
  } catch (error) {
    console.error("[CALIBRATIONS] Get by id error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
