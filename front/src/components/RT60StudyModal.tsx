import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import type { RT60Progress, RT60Complete, RT60Failed } from "../context/SocketContext";

interface Props {
  isOpen: boolean;
  roomId: string;
  roomName: string;
  calibrationId: string;
  onClose: () => void;
  onComplete: () => void;
}

type StudyStep = "config" | "waiting" | "measuring" | "result";

interface StudyConfig {
  name: string;
  notes: string;
}

interface StudyResult {
  studyId: string;
  peakVrms: number;
  peakDbSPL: number;
  rt60Time: number;
  endVrms: number;
  endDbSPL: number;
  status: "completed" | "failed";
}

function RT60StudyModal({
  isOpen,
  roomId,
  roomName,
  calibrationId,
  onClose,
  onComplete,
}: Props) {
  const socket = useSocket();
  const navigate = useNavigate();
  const [step, setStep] = useState<StudyStep>("config");
  const [config, setConfig] = useState<StudyConfig>({
    name: `Estudio RT60 - ${new Date().toLocaleDateString("es-MX")}`,
    notes: "",
  });
  const [currentVrms, setCurrentVrms] = useState<number | null>(null);
  const [currentDbSPL, setCurrentDbSPL] = useState<number | null>(null);
  const [result, setResult] = useState<StudyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerStartRef = useRef<number>(0);

  useEffect(() => {
    if (!isOpen) {
      // Reset state cuando se cierra el modal
      setStep("config");
      setConfig({
        name: `Estudio RT60 - ${new Date().toLocaleDateString("es-MX")}`,
        notes: "",
      });
      setCurrentVrms(null);
      setCurrentDbSPL(null);
      setResult(null);
      setError(null);
      setElapsedTime(0);
      timerStartRef.current = 0;
    }
  }, [isOpen]);

  // Timer para elapsed time
  useEffect(() => {
    let interval: number | null = null;

    if (step === "waiting" || step === "measuring") {
      if (timerStartRef.current === 0) {
        timerStartRef.current = Date.now();
      }
      
      interval = window.setInterval(() => {
        setElapsedTime((Date.now() - timerStartRef.current) / 1000);
      }, 100);
    } else {
      timerStartRef.current = 0;
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step]);

  // Configurar listeners de Socket.IO
  useEffect(() => {
    if (!isOpen) return;

    function handleProgress(data: RT60Progress) {
      setCurrentVrms(data.currentVrms);
      setCurrentDbSPL(data.currentDbSPL);

      if (data.phase === "waiting" && step !== "waiting") {
        setStep("waiting");
        timerStartRef.current = Date.now();
      } else if (data.phase === "measuring" && step !== "measuring") {
        setStep("measuring");
        timerStartRef.current = Date.now();
      }
    }

    function handleComplete(data: RT60Complete) {
      setResult({
        studyId: data.studyId,
        peakVrms: data.peakVrms,
        peakDbSPL: data.peakDbSPL,
        rt60Time: data.rt60Time,
        endVrms: data.endVrms,
        endDbSPL: data.endDbSPL,
        status: "completed",
      });
      setStep("result");
    }

    function handleFailed(data: RT60Failed) {
      setError(data.error);
      setResult({
        studyId: "",
        peakVrms: 0,
        peakDbSPL: 0,
        rt60Time: 0,
        endVrms: 0,
        endDbSPL: 0,
        status: "failed",
      });
      setStep("result");
    }

    socket.on("study:progress", handleProgress);
    socket.on("study:complete", handleComplete);
    socket.on("study:failed", handleFailed);

    return () => {
      socket.off("study:progress", handleProgress);
      socket.off("study:complete", handleComplete);
      socket.off("study:failed", handleFailed);
    };
  }, [isOpen, socket, step]);

  function handleStartStudy() {
    setStep("waiting");
    setError(null);
    setElapsedTime(0);
    timerStartRef.current = Date.now();
    socket.startRT60Study(roomId, calibrationId, config.name, config.notes);
  }

  function handleCancelStudy() {
    socket.cancelRT60Study();
    onClose();
  }

  function handleFinish() {
    onComplete();
    onClose();
  }

  function handleRetry() {
    setStep("config");
    setCurrentVrms(null);
    setCurrentDbSPL(null);
    setResult(null);
    setError(null);
    setElapsedTime(0);
  }

  function handleViewDetails() {
    if (result && result.studyId) {
      navigate(`/dashboard/study/${result.studyId}`);
    }
    onClose();
  }

  if (!isOpen) return null;

  return (
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
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          padding: "32px",
          maxWidth: "600px",
          width: "90%",
          maxHeight: "90vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "24px", fontWeight: 600, marginBottom: "8px" }}>
            Estudio de Reverberación (RT60)
          </h2>
          <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
            {roomName}
          </p>
        </div>

        {/* Step Indicators */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "32px" }}>
          <div
            style={{
              flex: 1,
              height: "4px",
              borderRadius: "2px",
              background:
                step === "config" || step === "waiting" || step === "measuring" || step === "result"
                  ? "var(--accent-green)"
                  : "var(--border)",
            }}
          />
          <div
            style={{
              flex: 1,
              height: "4px",
              borderRadius: "2px",
              background:
                step === "waiting" || step === "measuring" || step === "result"
                  ? "var(--accent-green)"
                  : "var(--border)",
            }}
          />
          <div
            style={{
              flex: 1,
              height: "4px",
              borderRadius: "2px",
              background: step === "measuring" || step === "result"
                ? "var(--accent-green)"
                : "var(--border)",
            }}
          />
          <div
            style={{
              flex: 1,
              height: "4px",
              borderRadius: "2px",
              background: step === "result" ? "var(--accent-green)" : "var(--border)",
            }}
          />
        </div>

        {/* Content */}
        {step === "config" && (
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
              Configuración del Estudio
            </h3>

            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  marginBottom: "6px",
                }}
              >
                Nombre del estudio
              </label>
              <input
                type="text"
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
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

            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  marginBottom: "6px",
                }}
              >
                Notas (opcional)
              </label>
              <textarea
                value={config.notes}
                onChange={(e) => setConfig({ ...config, notes: e.target.value })}
                rows={3}
                placeholder="Describe las condiciones del estudio, ubicación, etc."
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

            <div
              style={{
                padding: "16px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                marginBottom: "24px",
              }}
            >
              <h4 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>
                Instrucciones
              </h4>
              <ol style={{ marginLeft: "20px", lineHeight: 1.8, color: "var(--text-muted)", fontSize: "13px" }}>
                <li style={{ marginBottom: "8px" }}>
                  El sistema esperará a detectar un pico de sonido (3x el nivel base)
                </li>
                <li style={{ marginBottom: "8px" }}>
                  Genera un sonido fuerte y súbito (aplauso, estallido, etc.)
                </li>
                <li style={{ marginBottom: "8px" }}>
                  El sistema medirá automáticamente el tiempo que tarda el sonido en decaer 60 dB
                </li>
                <li>
                  Mantén el ambiente silencioso después del pico
                </li>
              </ol>
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                style={{
                  padding: "10px 20px",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text)",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleStartStudy}
                disabled={!config.name.trim()}
                style={{
                  padding: "10px 20px",
                  background: config.name.trim() ? "var(--accent-green)" : "var(--bg-hover)",
                  border: "none",
                  borderRadius: "8px",
                  color: config.name.trim() ? "white" : "var(--text-muted)",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: config.name.trim() ? "pointer" : "not-allowed",
                }}
              >
                Iniciar Estudio
              </button>
            </div>
          </div>
        )}

        {step === "waiting" && (
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
              Esperando pico de sonido...
            </h3>

            <div
              style={{
                padding: "32px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                marginBottom: "24px",
                textAlign: "center",
              }}
            >
              {/* Animated pulse indicator */}
              <div
                style={{
                  width: "120px",
                  height: "120px",
                  background: "var(--accent-green)",
                  borderRadius: "50%",
                  margin: "0 auto 24px",
                  opacity: 0.3,
                  animation: "pulse 2s ease-in-out infinite",
                }}
              />
              <style>{`
                @keyframes pulse {
                  0%, 100% { transform: scale(1); opacity: 0.3; }
                  50% { transform: scale(1.1); opacity: 0.5; }
                }
              `}</style>

              <p style={{ fontSize: "16px", color: "var(--text)", marginBottom: "8px" }}>
                Genera un sonido fuerte y súbito
              </p>
              <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                (Aplauso, estallido, etc.)
              </p>
            </div>

            <div
              style={{
                padding: "16px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                }}
              >
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Nivel actual
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: 600, marginTop: "4px" }}>
                    {currentDbSPL !== null ? `${currentDbSPL.toFixed(1)} dB` : "---"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Tiempo transcurrido
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: 600, marginTop: "4px" }}>
                    {elapsedTime.toFixed(1)} s
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: "12px 16px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                marginBottom: "24px",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>
                Timeout en 30 segundos si no se detecta pico
              </p>
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={handleCancelStudy}
                style={{
                  padding: "10px 20px",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text)",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {step === "measuring" && (
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
              Midiendo RT60...
            </h3>

            <div
              style={{
                padding: "32px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                marginBottom: "24px",
                textAlign: "center",
              }}
            >
              {/* Animated decay indicator */}
              <div
                style={{
                  width: "120px",
                  height: "120px",
                  background: "var(--accent-orange)",
                  borderRadius: "50%",
                  margin: "0 auto 24px",
                  opacity: 0.8,
                  animation: "decay 3s ease-out infinite",
                }}
              />
              <style>{`
                @keyframes decay {
                  0% { transform: scale(1); opacity: 0.8; }
                  100% { transform: scale(0.3); opacity: 0.1; }
                }
              `}</style>

              <p style={{ fontSize: "16px", color: "var(--text)", marginBottom: "8px" }}>
                Pico detectado
              </p>
              <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                Midiendo tiempo de decaimiento...
              </p>
            </div>

            <div
              style={{
                padding: "16px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                }}
              >
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Nivel actual
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: 600, marginTop: "4px" }}>
                    {currentDbSPL !== null ? `${currentDbSPL.toFixed(1)} dB` : "---"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Tiempo desde pico
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: 600, marginTop: "4px" }}>
                    {elapsedTime.toFixed(1)} s
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: "12px 16px",
                background: "var(--warning-bg)",
                border: "1px solid var(--accent-orange)",
                borderRadius: "8px",
                marginBottom: "24px",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: "13px", color: "var(--accent-orange)", margin: 0 }}>
                Mantén el ambiente silencioso
              </p>
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={handleCancelStudy}
                style={{
                  padding: "10px 20px",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text)",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {step === "result" && (
          <div>
            {result && result.status === "completed" ? (
              <>
                <div style={{ textAlign: "center", marginBottom: "24px" }}>
                  <div
                    style={{
                      width: "80px",
                      height: "80px",
                      background: "var(--success-bg)",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 16px",
                    }}
                  >
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--accent-green)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h3 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "8px" }}>
                    Estudio Completado
                  </h3>
                  <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
                    El tiempo de reverberación ha sido medido exitosamente
                  </p>
                </div>

                <div
                  style={{
                    padding: "24px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    marginBottom: "16px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "8px" }}>
                    Tiempo RT60
                  </div>
                  <div style={{ fontSize: "48px", fontWeight: 700, color: "var(--accent-green)" }}>
                    {result.rt60Time.toFixed(2)}
                  </div>
                  <div style={{ fontSize: "16px", color: "var(--text-muted)" }}>
                    segundos
                  </div>
                </div>

                <div
                  style={{
                    padding: "20px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    marginBottom: "24px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Pico detectado
                      </div>
                      <div style={{ fontSize: "18px", fontWeight: 600, marginTop: "4px" }}>
                        {result.peakDbSPL.toFixed(1)} dB
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Nivel final
                      </div>
                      <div style={{ fontSize: "18px", fontWeight: 600, marginTop: "4px" }}>
                        {result.endDbSPL.toFixed(1)} dB
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                  <button
                    onClick={handleFinish}
                    style={{
                      padding: "10px 20px",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      color: "var(--text)",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={handleViewDetails}
                    style={{
                      padding: "10px 20px",
                      background: "var(--accent-blue)",
                      border: "none",
                      borderRadius: "8px",
                      color: "white",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Ver Detalles
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: "center", marginBottom: "24px" }}>
                  <div
                    style={{
                      width: "80px",
                      height: "80px",
                      background: "var(--error-bg)",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 16px",
                    }}
                  >
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--error)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </div>
                  <h3 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "8px" }}>
                    Estudio Fallido
                  </h3>
                  <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
                    {error || "No se pudo completar la medición RT60"}
                  </p>
                </div>

                <div
                  style={{
                    padding: "20px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    marginBottom: "24px",
                  }}
                >
                  <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                    Posibles causas:
                  </p>
                  <ul style={{ marginLeft: "20px", marginTop: "12px", color: "var(--text-muted)", fontSize: "13px", lineHeight: 1.8 }}>
                    <li>No se detectó un pico de sonido en 30 segundos</li>
                    <li>El sonido no decayó suficiente en 120 segundos</li>
                    <li>Ruido ambiental interfirió con la medición</li>
                  </ul>
                </div>

                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                  <button
                    onClick={onClose}
                    style={{
                      padding: "10px 20px",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      color: "var(--text)",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={handleRetry}
                    style={{
                      padding: "10px 20px",
                      background: "var(--accent-blue)",
                      border: "none",
                      borderRadius: "8px",
                      color: "white",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Reintentar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default RT60StudyModal;
