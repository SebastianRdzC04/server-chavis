import { Routes, Route } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import RoomDetailPage from "./RoomDetailPage";
import StudyDetailPage from "./StudyDetailPage";

function DashboardPage() {
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header
        style={{
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h1 style={{ fontSize: "20px", fontWeight: 700 }}>
          Chavis <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>Sound Monitor</span>
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>
            {user?.email || "Usuario"}
          </span>
          <button
            onClick={handleLogout}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--text)",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            Cerrar Sesión
          </button>
        </div>
      </header>

      {/* Content */}
      <div style={{ flex: 1, display: "flex" }}>
        <Sidebar />

        {/* Main content */}
        <main style={{ flex: 1, overflow: "auto" }}>
          <Routes>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/room/:roomId" element={<RoomDetailPage />} />
            <Route path="/study/:studyId" element={<StudyDetailPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function DashboardHome() {
  return (
    <div style={{ padding: "24px" }}>
      <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
        Bienvenido a Chavis Sound Monitor
      </h2>
      <p style={{ color: "var(--text-muted)", marginBottom: "16px" }}>
        Selecciona un espacio en el sidebar o crea uno nuevo para comenzar.
      </p>
      <div
        style={{
          padding: "24px",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
        }}
      >
        <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>
          ¿Qué puedes hacer?
        </h3>
        <ul style={{ marginLeft: "20px", color: "var(--text-muted)", lineHeight: 1.8 }}>
          <li>Crear espacios para diferentes habitaciones</li>
          <li>Calibrar el micrófono con 60 dB SPL constantes</li>
          <li>Realizar estudios de reverberación RT60</li>
          <li>Visualizar datos en tiempo real</li>
        </ul>
      </div>
    </div>
  );
}

export default DashboardPage;
