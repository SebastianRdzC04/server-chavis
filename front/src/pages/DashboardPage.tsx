import { useState, useEffect, useCallback } from "react";
import { Routes, Route } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { apiClient } from "../utils/api";
import Sidebar from "../components/Sidebar";
import CalibrationModal from "../components/CalibrationModal";
import RoomDetailPage from "./RoomDetailPage";
import StudyDetailPage from "./StudyDetailPage";
import type { SoundData } from "../types";

interface SystemCalibration {
  calibrated: boolean;
  vrmsAt60dB?: number;
  samplesCount?: number;
  stdDeviation?: number;
  calibratedAt?: string;
}

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
  const socket = useSocket();
  const [calibration, setCalibration] = useState<SystemCalibration>({ calibrated: false });
  const [loadingCal, setLoadingCal] = useState(true);
  const [isCalModalOpen, setIsCalModalOpen] = useState(false);

  // Monitor en vivo
  const [currentData, setCurrentData] = useState<SoundData | null>(null);
  const [historyData, setHistoryData] = useState<SoundData[]>([]);

  const loadCalibration = useCallback(async () => {
    setLoadingCal(true);
    try {
      const resp = await apiClient.request<SystemCalibration>("/api/system-calibration");
      if (resp.data) {
        setCalibration(resp.data);
      }
    } catch (_) {
      // silencioso
    } finally {
      setLoadingCal(false);
    }
  }, []);

  useEffect(() => {
    loadCalibration();
  }, [loadCalibration]);

  // Escuchar datos en vivo del Arduino
  useEffect(() => {
    function handleNewData(data: SoundData) {
      setCurrentData(data);
      setHistoryData((prev) => {
        const updated = [...prev, data];
        return updated.length > 60 ? updated.slice(-60) : updated;
      });
    }

    socket.on("data:new", handleNewData);
    return () => {
      socket.off("data:new", handleNewData);
    };
  }, [socket]);

  // Escuchar actualizacion de calibracion global
  useEffect(() => {
    function handleCalibrationUpdated() {
      loadCalibration();
    }
    socket.on("calibration:system-updated", handleCalibrationUpdated);
    return () => {
      socket.off("calibration:system-updated", handleCalibrationUpdated);
    };
  }, [socket, loadCalibration]);

  function handleCalibrationComplete() {
    loadCalibration();
    setIsCalModalOpen(false);
  }

  const isCalibrated = calibration.calibrated;

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Seccion: Estado del sistema / Calibracion */}
      <div
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${isCalibrated ? "var(--accent-green)" : "var(--accent-orange)"}`,
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
            marginBottom: isCalibrated ? "20px" : "0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Indicador de estado */}
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: loadingCal
                  ? "var(--text-muted)"
                  : isCalibrated
                  ? "var(--accent-green)"
                  : "var(--accent-orange)",
                boxShadow: isCalibrated
                  ? "0 0 8px var(--accent-green)"
                  : "0 0 8px var(--accent-orange)",
              }}
            />
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>
                Calibración del Sistema
              </h2>
              <p
                style={{
                  fontSize: "13px",
                  color: isCalibrated ? "var(--accent-green)" : "var(--accent-orange)",
                  margin: "2px 0 0",
                }}
              >
                {loadingCal
                  ? "Verificando..."
                  : isCalibrated
                  ? "Sistema calibrado"
                  : "Sin calibrar — los dB SPL no estarán disponibles"}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsCalModalOpen(true)}
            style={{
              padding: "8px 18px",
              background: isCalibrated ? "var(--bg-hover)" : "var(--accent-orange)",
              color: isCalibrated ? "var(--text)" : "white",
              border: isCalibrated ? "1px solid var(--border)" : "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {isCalibrated ? "Recalibrar" : "Calibrar ahora"}
          </button>
        </div>

        {isCalibrated && calibration.vrmsAt60dB !== undefined && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "16px",
              paddingTop: "16px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Vrms @ 60 dB SPL</div>
              <div style={{ fontSize: "18px", fontWeight: 600, marginTop: "4px" }}>
                {calibration.vrmsAt60dB.toFixed(6)} V
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Desviación estándar
              </div>
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  marginTop: "4px",
                  color: "var(--accent-green)",
                }}
              >
                {calibration.stdDeviation !== undefined
                  ? (calibration.stdDeviation * 100).toFixed(2) + "%"
                  : "---"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Muestras</div>
              <div style={{ fontSize: "18px", fontWeight: 600, marginTop: "4px" }}>
                {calibration.samplesCount ?? "---"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Fecha</div>
              <div style={{ fontSize: "18px", fontWeight: 600, marginTop: "4px" }}>
                {calibration.calibratedAt
                  ? new Date(calibration.calibratedAt).toLocaleDateString("es-MX")
                  : "---"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Seccion: Monitor en Vivo */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "20px",
          }}
        >
          {/* Punto pulsante cuando hay datos */}
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: currentData ? "var(--accent-green)" : "var(--text-muted)",
              animation: currentData ? "pulse 1.5s infinite" : "none",
            }}
          />
          <h3 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>Monitor en Vivo</h3>
          {currentData && (
            <span style={{ fontSize: "12px", color: "var(--text-muted)", marginLeft: "auto" }}>
              Ultima muestra: {new Date(currentData.timestamp).toLocaleTimeString("es-MX")}
            </span>
          )}
        </div>

        {/* Tarjetas de datos */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          {/* Vrms */}
          <div
            style={{
              padding: "20px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>
              Voltaje RMS
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--accent-blue)" }}>
              {currentData ? currentData.vrms.toFixed(6) : "---"}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
              V
            </div>
          </div>

          {/* dB SPL calibrado */}
          <div
            style={{
              padding: "20px",
              background: "var(--bg)",
              border: `1px solid ${
                isCalibrated && currentData?.dbSPL != null
                  ? "var(--accent-green)"
                  : "var(--border)"
              }`,
              borderRadius: "10px",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>
              Nivel Sonoro (dB SPL)
            </div>
            <div
              style={{
                fontSize: "28px",
                fontWeight: 700,
                color:
                  isCalibrated && currentData?.dbSPL != null
                    ? "var(--accent-green)"
                    : "var(--text-muted)",
              }}
            >
              {currentData?.dbSPL != null ? currentData.dbSPL.toFixed(1) : "---"}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
              {isCalibrated ? "dB SPL (calibrado)" : "Calibra el sistema primero"}
            </div>
          </div>
        </div>

        {/* Grafica de historia */}
        {historyData.length > 1 && (
          <LiveChart data={historyData} isCalibrated={isCalibrated} />
        )}

        {!currentData && (
          <div
            style={{
              textAlign: "center",
              padding: "32px",
              color: "var(--text-muted)",
              fontSize: "14px",
            }}
          >
            Esperando datos del Arduino...
          </div>
        )}
      </div>

      {/* Modal de calibracion */}
      <CalibrationModal
        isOpen={isCalModalOpen}
        onClose={() => setIsCalModalOpen(false)}
        onComplete={handleCalibrationComplete}
      />
    </div>
  );
}

// Grafica simple de linea usando SVG nativo
function LiveChart({
  data,
  isCalibrated,
}: {
  data: SoundData[];
  isCalibrated: boolean;
}) {
  const width = 800;
  const height = 120;
  const padding = { top: 10, right: 10, bottom: 20, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  // Calcular rango de dB SPL si calibrado, sino vrms
  const useDbSPL = isCalibrated && data.some((d) => d.dbSPL != null);
  const values = useDbSPL
    ? data.map((d) => d.dbSPL ?? 0)
    : data.map((d) => d.vrms);

  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  function toX(i: number) {
    return padding.left + (i / (data.length - 1)) * innerW;
  }
  function toY(v: number) {
    return padding.top + innerH - ((v - minV) / range) * innerH;
  }

  const points = values
    .map((v, i) => `${toX(i)},${toY(v)}`)
    .join(" ");

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {/* Linea de grilla */}
        {[0, 0.5, 1].map((t) => {
          const y = padding.top + innerH * (1 - t);
          const label = (minV + range * t).toFixed(useDbSPL ? 1 : 4);
          return (
            <g key={t}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + innerW}
                y2={y}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={padding.left - 4}
                y={y + 4}
                fontSize="9"
                fill="var(--text-muted)"
                textAnchor="end"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Linea de datos */}
        <polyline
          points={points}
          fill="none"
          stroke={useDbSPL ? "var(--accent-green)" : "var(--accent-blue)"}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          textAlign: "center",
          fontSize: "11px",
          color: "var(--text-muted)",
          marginTop: "4px",
        }}
      >
        {useDbSPL ? "dB SPL (calibrado)" : "Vrms (V)"} — ultimas {data.length} muestras
      </div>
    </div>
  );
}

export default DashboardPage;
