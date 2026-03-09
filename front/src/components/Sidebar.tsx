import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiClient } from "../utils/api";
import { Room } from "../types";

interface Props {
  onRoomSelect?: (roomId: string) => void;
}

function Sidebar({ onRoomSelect }: Props) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDescription, setNewRoomDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    loadRooms();
  }, []);

  async function loadRooms() {
    setLoading(true);
    const response = await apiClient.request<Room[]>("/api/rooms");
    if (response.data) {
      setRooms(response.data);
    }
    setLoading(false);
  }

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    setCreating(true);
    const response = await apiClient.request<Room>("/api/rooms", {
      method: "POST",
      body: JSON.stringify({
        name: newRoomName.trim(),
        description: newRoomDescription.trim() || undefined,
      }),
    });

    setCreating(false);

    if (response.data) {
      setRooms([response.data, ...rooms]);
      setShowCreateModal(false);
      setNewRoomName("");
      setNewRoomDescription("");
      navigate(`/dashboard/room/${response.data._id}`);
    }
  }

  function handleRoomClick(room: Room) {
    navigate(`/dashboard/room/${room._id}`);
    if (onRoomSelect) {
      onRoomSelect(room._id);
    }
  }

  const currentRoomId = location.pathname.split("/room/")[1]?.split("/")[0];

  return (
    <>
      <aside
        style={{
          width: "280px",
          background: "var(--bg-card)",
          borderRight: "1px solid var(--border)",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-muted)" }}>
            MIS ESPACIOS
          </h2>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              width: "28px",
              height: "28px",
              background: "var(--accent-blue)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "18px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Nueva habitación"
          >
            +
          </button>
        </div>

        {loading && (
          <div style={{ fontSize: "14px", color: "var(--text-muted)" }}>
            Cargando...
          </div>
        )}

        {!loading && rooms.length === 0 && (
          <div style={{ fontSize: "14px", color: "var(--text-muted)" }}>
            No hay espacios creados.
            <br />
            Haz clic en + para crear uno.
          </div>
        )}

        {!loading && rooms.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {rooms.map((room) => (
              <div
                key={room._id}
                onClick={() => handleRoomClick(room)}
                style={{
                  padding: "12px",
                  background: currentRoomId === room._id ? "var(--bg-card-hover)" : "transparent",
                  border: `1px solid ${currentRoomId === room._id ? "var(--accent-blue)" : "var(--border)"}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "4px" }}>
                  {currentRoomId === room._id && (
                    <span style={{ color: "var(--accent-blue)", marginRight: "6px" }}>✓</span>
                  )}
                  {room.name}
                </div>
                {room.description && (
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {room.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Modal para crear habitación */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "24px",
              width: "90%",
              maxWidth: "400px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
              Nuevo Espacio
            </h3>

            <form onSubmit={handleCreateRoom} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label
                  htmlFor="roomName"
                  style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}
                >
                  Nombre
                </label>
                <input
                  id="roomName"
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Ej: Mi cuarto sin muebles"
                  required
                  style={{
                    width: "100%",
                    padding: "12px",
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
                  htmlFor="roomDescription"
                  style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}
                >
                  Descripción (opcional)
                </label>
                <textarea
                  id="roomDescription"
                  value={newRoomDescription}
                  onChange={(e) => setNewRoomDescription(e.target.value)}
                  placeholder="Detalles del espacio..."
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "12px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    color: "var(--text)",
                    fontSize: "14px",
                    resize: "vertical",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: "10px 20px",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    color: "var(--text)",
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{
                    padding: "10px 20px",
                    background: creating ? "var(--border)" : "var(--accent-blue)",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: creating ? "not-allowed" : "pointer",
                  }}
                >
                  {creating ? "Creando..." : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default Sidebar;
