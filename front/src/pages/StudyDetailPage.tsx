import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Study } from "../types";
import { apiClient } from "../utils/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

function StudyDetailPage() {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();
  const [study, setStudy] = useState<Study | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studyId) return;
    loadStudy();
  }, [studyId]);

  async function loadStudy() {
    if (!studyId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.request<Study>(`/api/studies/${studyId}`, {
        method: "GET",
      });

      if (response.error) {
        setError(response.error);
        return;
      }

      if (response.data) {
        setStudy(response.data);
      }
    } catch (err) {
      console.error("[StudyDetail] Error loading study:", err);
      setError("Error al cargar el estudio");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
        Cargando...
      </div>
    );
  }

  if (error || !study) {
    return (
      <div style={{ padding: "32px" }}>
        <div style={{ textAlign: "center", color: "var(--error)", marginBottom: "24px" }}>
          {error || "Estudio no encontrado"}
        </div>
        <div style={{ textAlign: "center" }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: "10px 20px",
              background: "var(--accent-blue)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  // Generar datos simulados para la curva de decaimiento (60dB en rt60Time segundos)
  const decayData = [];
  if (study.status === "completed" && study.peakDbSPL && study.endDbSPL && study.rt60Time) {
    const steps = 50;
    const dbDrop = study.peakDbSPL - study.endDbSPL;
    
    for (let i = 0; i <= steps; i++) {
      const time = (i / steps) * study.rt60Time;
      // Decaimiento logarítmico aproximado
      const db = study.peakDbSPL - (dbDrop * (i / steps));
      decayData.push({ time: time.toFixed(2), db: db.toFixed(1) });
    }
  }

  return (
    <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: "8px 16px",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--text)",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            marginBottom: "16px",
          }}
        >
          ← Volver
        </button>
        <h1 style={{ fontSize: "28px", fontWeight: 600, marginBottom: "8px" }}>
          {study.name}
        </h1>
        {study.notes && (
          <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
            {study.notes}
          </p>
        )}
      </div>

      {/* Metadata Card */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "24px",
        }}
      >
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
          Información del Estudio
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "20px",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Estado</div>
            <div
              style={{
                marginTop: "6px",
                display: "inline-block",
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
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Fecha</div>
            <div style={{ fontSize: "16px", fontWeight: 600, marginTop: "6px" }}>
              {new Date(study.createdAt).toLocaleDateString("es-MX")}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Hora</div>
            <div style={{ fontSize: "16px", fontWeight: 600, marginTop: "6px" }}>
              {new Date(study.createdAt).toLocaleTimeString("es-MX")}
            </div>
          </div>
        </div>
      </div>

      {study.status === "completed" && (
        <>
          {/* RT60 Result Card */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "32px",
              marginBottom: "24px",
              textAlign: "center",
            }}
          >
            <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
              Tiempo de Reverberación RT60
            </h2>
            <div style={{ fontSize: "64px", fontWeight: 700, color: "var(--accent-green)" }}>
              {study.rt60Time?.toFixed(3)}
            </div>
            <div style={{ fontSize: "18px", color: "var(--text-muted)", marginTop: "8px" }}>
              segundos
            </div>
          </div>

          {/* Metrics Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "20px",
              }}
            >
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Pico detectado
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "8px" }}>
                {study.peakDbSPL?.toFixed(1)} dB
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                Vrms: {study.peakVrms?.toFixed(6)} V
              </div>
            </div>

            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "20px",
              }}
            >
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Nivel final
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "8px" }}>
                {study.endDbSPL?.toFixed(1)} dB
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                Vrms: {study.endVrms?.toFixed(6)} V
              </div>
            </div>

            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "20px",
              }}
            >
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Decaimiento total
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "8px" }}>
                {study.peakDbSPL && study.endDbSPL
                  ? (study.peakDbSPL - study.endDbSPL).toFixed(1)
                  : "---"}{" "}
                dB
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                En {study.rt60Time?.toFixed(2)} s
              </div>
            </div>
          </div>

          {/* Decay Curve Chart */}
          {decayData.length > 0 && (
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "24px",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
                Curva de Decaimiento
              </h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={decayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="time"
                    label={{ value: "Tiempo (s)", position: "insideBottom", offset: -5, fill: "var(--text-muted)" }}
                    tick={{ fontSize: 12, fill: "var(--text-muted)" }}
                  />
                  <YAxis
                    label={{ value: "dB SPL", angle: -90, position: "insideLeft", fill: "var(--text-muted)" }}
                    tick={{ fontSize: 12, fill: "var(--text-muted)" }}
                    domain={[
                      Math.floor((study.endDbSPL || 0) - 5),
                      Math.ceil((study.peakDbSPL || 100) + 5),
                    ]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      color: "var(--text)",
                    }}
                  />
                  <ReferenceLine
                    y={study.peakDbSPL}
                    stroke="var(--accent-green)"
                    strokeDasharray="3 3"
                    label={{ value: "Pico", fill: "var(--accent-green)", fontSize: 12 }}
                  />
                  <ReferenceLine
                    y={study.endDbSPL}
                    stroke="var(--accent-orange)"
                    strokeDasharray="3 3"
                    label={{ value: "Final (-60dB)", fill: "var(--accent-orange)", fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="db"
                    stroke="var(--accent-blue)"
                    strokeWidth={3}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "13px",
                  color: "var(--text-muted)",
                }}
              >
                Esta curva muestra el decaimiento aproximado del nivel de sonido desde el pico detectado
                hasta el nivel final en {study.rt60Time?.toFixed(2)} segundos (RT60).
              </div>
            </div>
          )}
        </>
      )}

      {study.status === "failed" && (
        <div
          style={{
            background: "var(--error-bg)",
            border: "1px solid var(--error)",
            borderRadius: "12px",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px", color: "var(--error)" }}>
            Estudio Fallido
          </h2>
          <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
            No se pudo completar la medición RT60. Verifica las condiciones del ambiente y vuelve a intentarlo.
          </p>
        </div>
      )}
    </div>
  );
}

export default StudyDetailPage;
