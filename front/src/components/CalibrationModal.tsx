import { useState, useEffect } from "react";
import { useSocket } from "../context/SocketContext";
import type { CalibrationProgress, CalibrationComplete, CalibrationFailed } from "../context/SocketContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type CalibrationStep = "instructions" | "capturing" | "result";

interface CalibrationResult {
  vrmsAt60dB: number;
  samplesCount: number;
  duration: number;
  stdDeviation: number;
  isValid: boolean;
}

// Calibracion global del sistema — no requiere roomId ni autenticacion
function CalibrationModal({ isOpen, onClose, onComplete }: Props) {
  const socket = useSocket();
  const [step, setStep] = useState<CalibrationStep>("instructions");
  const [progress, setProgress] = useState(0);
  const [samplesCount, setSamplesCount] = useState(0);
  const [currentVrms, setCurrentVrms] = useState<number | null>(null);
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep("instructions");
      setProgress(0);
      setSamplesCount(0);
      setCurrentVrms(null);
      setResult(null);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleProgress(data: CalibrationProgress) {
      setSamplesCount(data.samplesCount);
      setCurrentVrms(data.currentVrms);
      setProgress(Math.round(data.progress));
    }

    function handleComplete(data: CalibrationComplete) {
      setResult({
        vrmsAt60dB: data.vrmsAt60dB,
        samplesCount: data.samplesCount,
        duration: data.duration,
        stdDeviation: data.stdDeviation,
        isValid: data.isValid,
      });
      setStep("result");
    }

    function handleFailed(data: CalibrationFailed) {
      setError(data.error);
      if (data.stdDeviation !== undefined) {
        setResult({
          vrmsAt60dB: 0,
          samplesCount: 0,
          duration: 0,
          stdDeviation: data.stdDeviation,
          isValid: false,
        });
      }
      setStep("result");
    }

    socket.on("calibration:progress", handleProgress);
    socket.on("calibration:complete", handleComplete);
    socket.on("calibration:failed", handleFailed);

    return () => {
      socket.off("calibration:progress", handleProgress);
      socket.off("calibration:complete", handleComplete);
      socket.off("calibration:failed", handleFailed);
    };
  }, [isOpen, socket]);

  function handleStartCapture() {
    setStep("capturing");
    setError(null);
    // Calibracion global — sin roomId
    socket.startCalibration();
  }

  function handleCancelCapture() {
    socket.cancelCalibration();
    onClose();
  }

  function handleFinish() {
    onComplete();
    onClose();
  }

  function handleRetry() {
    setStep("instructions");
    setProgress(0);
    setSamplesCount(0);
    setCurrentVrms(null);
    setResult(null);
    setError(null);
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
            Calibración del Sistema
          </h2>
          <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
            Calibración global del micrófono — aplica a todo el sistema
          </p>
        </div>

        {/* Step Indicators */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "32px" }}>
          {(["instructions", "capturing", "result"] as CalibrationStep[]).map((s, i) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: "4px",
                borderRadius: "2px",
                background:
                  (step === "instructions" && i === 0) ||
                  (step === "capturing" && i <= 1) ||
                  step === "result"
                    ? "var(--accent-blue)"
                    : "var(--border)",
              }}
            />
          ))}
        </div>

        {/* Step: Instrucciones */}
        {step === "instructions" && (
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
              Instrucciones
            </h3>
            <div
              style={{
                padding: "16px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                marginBottom: "20px",
              }}
            >
              <ol style={{ marginLeft: "20px", lineHeight: 1.9, color: "var(--text)" }}>
                <li style={{ marginBottom: "10px" }}>
                  Prepara una fuente de sonido constante de <strong>60 dB SPL</strong>{" "}
                  (app de generador de tonos o sonómetro de referencia)
                </li>
                <li style={{ marginBottom: "10px" }}>
                  Coloca el micrófono en la posición de medición habitual
                </li>
                <li style={{ marginBottom: "10px" }}>
                  Asegúrate de que el nivel de sonido sea <strong>constante y estable</strong>{" "}
                  durante 10 segundos
                </li>
                <li>
                  Haz clic en <strong>Iniciar Captura</strong> cuando estés listo
                </li>
              </ol>
            </div>

            <div
              style={{
                padding: "12px 16px",
                background: "var(--warning-bg)",
                border: "1px solid var(--accent-orange)",
                borderRadius: "8px",
                marginBottom: "24px",
              }}
            >
              <p style={{ fontSize: "13px", color: "var(--accent-orange)", margin: 0 }}>
                <strong>Importante:</strong> Esta calibración es global y reemplaza cualquier
                calibración anterior. Si la variación es mayor al 5%, será rechazada.
              </p>
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
                onClick={handleStartCapture}
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
                Iniciar Captura
              </button>
            </div>
          </div>
        )}

        {/* Step: Capturando */}
        {step === "capturing" && (
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
              Capturando datos...
            </h3>

            <div
              style={{
                marginBottom: "24px",
                padding: "24px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
              }}
            >
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>
                    Progreso
                  </span>
                  <span style={{ fontSize: "24px", fontWeight: 700, color: "var(--accent-blue)" }}>
                    {progress}%
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "var(--border)",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: "100%",
                      background: "var(--accent-blue)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                  paddingTop: "16px",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Muestras capturadas
                  </div>
                  <div style={{ fontSize: "20px", fontWeight: 600, marginTop: "4px" }}>
                    {samplesCount}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Vrms actual
                  </div>
                  <div style={{ fontSize: "20px", fontWeight: 600, marginTop: "4px" }}>
                    {currentVrms !== null ? currentVrms.toFixed(6) : "---"} V
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
                Mantenga el nivel de 60 dB SPL constante durante 10 segundos
              </p>
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={handleCancelCapture}
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

        {/* Step: Resultado */}
        {step === "result" && (
          <div>
            {result && result.isValid ? (
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
                    Calibración Exitosa
                  </h3>
                  <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
                    El sistema ha sido calibrado correctamente
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Vrms a 60 dB SPL
                      </div>
                      <div style={{ fontSize: "20px", fontWeight: 600, marginTop: "4px" }}>
                        {result.vrmsAt60dB.toFixed(6)} V
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Desviación estándar
                      </div>
                      <div
                        style={{
                          fontSize: "20px",
                          fontWeight: 600,
                          marginTop: "4px",
                          color: "var(--accent-green)",
                        }}
                      >
                        {(result.stdDeviation * 100).toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Muestras
                      </div>
                      <div style={{ fontSize: "20px", fontWeight: 600, marginTop: "4px" }}>
                        {result.samplesCount}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Duración
                      </div>
                      <div style={{ fontSize: "20px", fontWeight: 600, marginTop: "4px" }}>
                        {result.duration.toFixed(1)} s
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                  <button
                    onClick={handleFinish}
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
                    Finalizar
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
                    Calibración Fallida
                  </h3>
                  <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
                    {error || "La variación del nivel de sonido fue mayor al 5%"}
                  </p>
                </div>

                {result && result.stdDeviation > 0 && (
                  <div
                    style={{
                      padding: "20px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      marginBottom: "24px",
                    }}
                  >
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Variación detectada
                      </div>
                      <div
                        style={{
                          fontSize: "20px",
                          fontWeight: 600,
                          marginTop: "4px",
                          color: "var(--error)",
                        }}
                      >
                        {(result.stdDeviation * 100).toFixed(2)}% (máx. 5%)
                      </div>
                    </div>
                    <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                      El nivel de sonido varió demasiado durante la captura. Asegúrate de
                      mantener un nivel constante de 60 dB SPL.
                    </p>
                  </div>
                )}

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

export default CalibrationModal;
