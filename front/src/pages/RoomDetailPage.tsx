import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Room, Study } from "../types";
import { apiClient } from "../utils/api";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import SoundMonitor from "../components/SoundMonitor";
import RT60StudyModal from "../components/RT60StudyModal";
import type { SoundData } from "../types";

interface SystemCalibration {
  calibrated: boolean;
  vrmsAt60dB?: number;
  samplesCount?: number;
  stdDeviation?: number;
  calibratedAt?: string;
}

function RoomDetailPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const socket = useSocket();
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [systemCalibration, setSystemCalibration] = useState<SystemCalibration>({ calibrated: false });
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado para edición de sala
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Estado de modales
  const [isRT60ModalOpen, setIsRT60ModalOpen] = useState(false);

  // Estado de monitor en vivo
  const [currentData, setCurrentData] = useState<SoundData | null>(null);
  const [historyData, setHistoryData] = useState<SoundData[]>([]);

  useEffect(() => {
    if (!roomId) return;
    loadRoomData();
  }, [roomId]);

  // Autenticar usuario con Socket.IO
  useEffect(() => {
    if (socket.connected && user) {
      socket.authenticate(user.id);
    }
  }, [socket.connected, user, socket]);

  // Seleccionar sala cuando cambia roomId
  useEffect(() => {
    if (socket.connected && roomId) {
      socket.selectRoom(roomId);
    }
  }, [socket.connected, roomId, socket]);

  // Escuchar datos en vivo
  useEffect(() => {
    function handleNewData(data: SoundData) {
      setCurrentData(data);
      setHistoryData((prev) => {
        const updated = [...prev, data];
        if (updated.length > 100) {
          return updated.slice(-100);
        }
        return updated;
      });
    }

    socket.on("data:new", handleNewData);

    return () => {
      socket.off("data:new", handleNewData);
    };
  }, [socket]);

  // Escuchar actualizaciones de calibracion del sistema
  useEffect(() => {
    function handleCalibrationUpdated(data: { vrmsAt60dB: number; calibratedAt: string }) {
      setSystemCalibration((prev) => ({
        ...prev,
        calibrated: true,
        vrmsAt60dB: data.vrmsAt60dB,
        calibratedAt: data.calibratedAt,
      }));
    }

    socket.on("calibration:system-updated", handleCalibrationUpdated);

    return () => {
      socket.off("calibration:system-updated", handleCalibrationUpdated);
    };
  }, [socket]);

  async function loadRoomData() {
    if (!roomId) return;
    setLoading(true);
    setError(null);

    try {
      // Cargar datos de la sala
      const roomResponse = await apiClient.request<Room>(`/api/rooms/${roomId}`, {
        method: "GET",
      });

      if (roomResponse.error) {
        setError(roomResponse.error);
        setLoading(false);
        return;
      }

      if (roomResponse.data) {
        setRoom(roomResponse.data);
        setEditName(roomResponse.data.name);
        setEditDescription(roomResponse.data.description || "");
      }

      // Cargar calibracion global del sistema
      const calResponse = await apiClient.request<SystemCalibration>("/api/system-calibration", {
        method: "GET",
      });

      if (calResponse.data) {
        setSystemCalibration(calResponse.data);
      }

      // Cargar estudios
      const studiesResponse = await apiClient.request<Study[]>(
        `/api/studies?roomId=${roomId}`,
        { method: "GET" }
      );

      if (studiesResponse.data) {
        setStudies(studiesResponse.data);
      }
    } catch (err) {
      console.error("[RoomDetail] Error loading room data:", err);
      setError("Error al cargar los datos de la sala");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveRoom() {
    if (!roomId || !room) return;

    const response = await apiClient.request<Room>(`/api/rooms/${roomId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: editName,
        description: editDescription,
      }),
    });

    if (response.error) {
      setError(response.error);
      return;
    }

    if (response.data) {
      setRoom(response.data);
      setIsEditing(false);
    }
  }

  function handleCancelEdit() {
    setEditName(room?.name || "");
    setEditDescription(room?.description || "");
    setIsEditing(false);
  }

  function handleStartRT60Study() {
    setIsRT60ModalOpen(true);
  }

  function handleRT60Complete() {
    loadRoomData();
  }

  if (loading) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
        Cargando...
      </div>
    );
  }

  if (error || !room) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "var(--error)" }}>
        {error || "Sala no encontrada"}
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Sección: Información de la Sala */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "16px",
          }}
        >
          <h2 style={{ fontSize: "24px", fontWeight: 600, margin: 0 }}>
            {isEditing ? "Editar Sala" : room.name}
          </h2>
          <div style={{ display: "flex", gap: "8px" }}>
            {isEditing ? (
              <>
                <button
                  onClick={handleSaveRoom}
                  style={{
                    padding: "8px 16px",
                    background: "var(--accent-blue)",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Guardar
                </button>
                <button
                  onClick={handleCancelEdit}
                  style={{
                    padding: "8px 16px",
                    background: "var(--bg-hover)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  padding: "8px 16px",
                  background: "var(--bg-hover)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Editar
              </button>
            )}
          </div>
        </div>

        {isEditing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  marginBottom: "6px",
                }}
              >
                Nombre
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text)",
                  fontSize: "14px",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  marginBottom: "6px",
                }}
              >
                Descripción
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text)",
                  fontSize: "14px",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>
        ) : (
          <>
            {room.description && (
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--text-muted)",
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                {room.description}
              </p>
            )}
            <div
              style={{
                marginTop: "16px",
                fontSize: "12px",
                color: "var(--text-muted)",
              }}
            >
              Creada el {new Date(room.createdAt).toLocaleDateString("es-MX")}
            </div>
          </>
        )}
      </div>

      {/* Sección: Estado de Calibración del Sistema */}
      <div
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${systemCalibration.calibrated ? "var(--border)" : "var(--accent-orange)"}`,
          borderRadius: "12px",
          padding: "20px 24px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: systemCalibration.calibrated ? "var(--accent-green)" : "var(--accent-orange)",
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: "14px", fontWeight: 500 }}>
              {systemCalibration.calibrated
                ? `Sistema calibrado — Vrms ref.: ${systemCalibration.vrmsAt60dB?.toFixed(6)} V`
                : "Sistema sin calibrar"}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              {systemCalibration.calibrated
                ? `Calibrado el ${new Date(systemCalibration.calibratedAt!).toLocaleDateString("es-MX")}`
                : "Los estudios RT60 requieren calibración del sistema"}
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate("/dashboard")}
          style={{
            padding: "8px 16px",
            background: "transparent",
            color: systemCalibration.calibrated ? "var(--text-muted)" : "var(--accent-orange)",
            border: `1px solid ${systemCalibration.calibrated ? "var(--border)" : "var(--accent-orange)"}`,
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {systemCalibration.calibrated ? "Ver calibración" : "Calibrar sistema"}
        </button>
      </div>

      {/* Sección: Estudios de Reverberación */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h3 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>
            Estudios de Reverberación (RT60)
          </h3>
          <button
            onClick={handleStartRT60Study}
            disabled={!systemCalibration.calibrated}
            style={{
              padding: "8px 16px",
              background: systemCalibration.calibrated ? "var(--accent-green)" : "var(--bg-hover)",
              color: systemCalibration.calibrated ? "white" : "var(--text-muted)",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: systemCalibration.calibrated ? "pointer" : "not-allowed",
            }}
          >
            Nuevo Estudio
          </button>
        </div>

        {studies.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {studies.map((study) => (
              <div
                key={study._id}
                style={{
                  padding: "16px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 500 }}>{study.name}</div>
                  {study.notes && (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                      {study.notes}
                    </div>
                  )}
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                    {new Date(study.createdAt).toLocaleDateString("es-MX")} -{" "}
                    {new Date(study.createdAt).toLocaleTimeString("es-MX")}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  {study.status === "completed" && study.rt60Time !== undefined && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>RT60</div>
                      <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--accent-green)" }}>
                        {study.rt60Time.toFixed(2)} s
                      </div>
                    </div>
                  )}
                  <div
                    style={{
                      padding: "4px 12px",
                      borderRadius: "12px",
                      fontSize: "12px",
                      fontWeight: 500,
                      background:
                        study.status === "completed"
                          ? "var(--success-bg)"
                          : study.status === "failed"
                          ? "var(--error-bg)"
                          : "var(--warning-bg)",
                      color:
                        study.status === "completed"
                          ? "var(--accent-green)"
                          : study.status === "failed"
                          ? "var(--error)"
                          : "var(--accent-orange)",
                    }}
                  >
                    {study.status === "completed"
                      ? "Completado"
                      : study.status === "failed"
                      ? "Fallido"
                      : "Grabando"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "32px", color: "var(--text-muted)" }}>
            {systemCalibration.calibrated
              ? "No hay estudios de reverberación. Crea uno nuevo para comenzar."
              : "Calibra el sistema primero para poder crear estudios de reverberación."}
          </div>
        )}
      </div>

      {/* Sección: Monitor en Vivo */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
          Monitor en Vivo
        </h3>
        <SoundMonitor current={currentData} history={historyData} />
      </div>

      {/* Modales */}
      {roomId && room && (
        <RT60StudyModal
          isOpen={isRT60ModalOpen}
          roomId={roomId}
          roomName={room.name}
          calibrationId={systemCalibration.calibrated ? "system" : ""}
          onClose={() => setIsRT60ModalOpen(false)}
          onComplete={handleRT60Complete}
        />
      )}
    </div>
  );
}

export default RoomDetailPage;
