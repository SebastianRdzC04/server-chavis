import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { SoundData } from "../types";

interface Props {
  current: SoundData | null;
  history: SoundData[];
}

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function Card({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "24px",
        flex: "1 1 0",
        minWidth: "180px",
      }}
    >
      <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "8px" }}>
        {label}
      </div>
      <div style={{ fontSize: "36px", fontWeight: 700, color, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "4px" }}>
        {unit}
      </div>
    </div>
  );
}

function SoundMonitor({ current, history }: Props) {
  // Determinar si hay dB SPL calibrado disponible
  const hasCalibration = current?.dbSPL !== undefined && current?.dbSPL !== null;
  
  const chartData = history.map((d) => ({
    time: formatTime(d.timestamp),
    vrms: d.vrms,
    db_rel: d.db_rel,
    db_spl: d.db_spl,
    dbSPL: d.dbSPL,
  }));

  const lastRecords = [...history].reverse().slice(0, 20);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Cards */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <Card
          label="Voltaje RMS (Vrms)"
          value={current ? current.vrms.toFixed(6) : "---"}
          unit="V"
          color="var(--accent-blue)"
        />
        <Card
          label="dB Relativos"
          value={current ? current.db_rel.toFixed(1) : "---"}
          unit="dB rel"
          color="var(--accent-orange)"
        />
        <Card
          label={hasCalibration ? "dB SPL (Calibrado)" : "dB SPL (Sin calibrar)"}
          value={
            current
              ? hasCalibration
                ? current.dbSPL!.toFixed(1)
                : current.db_spl.toFixed(1)
              : "---"
          }
          unit="dB SPL"
          color={hasCalibration ? "var(--accent-green)" : "var(--text-muted)"}
        />
      </div>

      {/* Charts */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
        }}
      >
        {/* Chart Vrms */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "20px",
          }}
        >
          <h3 style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "16px" }}>
            Voltaje RMS
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text)",
                }}
              />
              <Line
                type="monotone"
                dataKey="vrms"
                stroke="var(--accent-blue)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Chart dB */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "20px",
          }}
        >
          <h3 style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "16px" }}>
            Niveles de Sonido (dB)
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text)",
                }}
              />
              <Line
                type="monotone"
                dataKey="db_rel"
                stroke="var(--accent-orange)"
                strokeWidth={2}
                dot={false}
                name="dB Rel"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="db_spl"
                stroke="var(--accent-green)"
                strokeWidth={2}
                dot={false}
                name="dB SPL"
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "20px",
          overflowX: "auto",
        }}
      >
        <h3 style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "16px" }}>
          Ultimos registros
        </h3>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "13px",
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "1px solid var(--border)",
                textAlign: "left",
              }}
            >
              <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontWeight: 500 }}>
                Hora
              </th>
              <th style={{ padding: "8px 12px", color: "var(--accent-blue)", fontWeight: 500 }}>
                Vrms (V)
              </th>
              <th style={{ padding: "8px 12px", color: "var(--accent-orange)", fontWeight: 500 }}>
                dB Rel
              </th>
              <th style={{ padding: "8px 12px", color: "var(--accent-green)", fontWeight: 500 }}>
                dB SPL
              </th>
            </tr>
          </thead>
          <tbody>
            {lastRecords.map((d, i) => {
              const hasDbSPL = d.dbSPL !== undefined && d.dbSPL !== null;
              return (
                <tr
                  key={i}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: i === 0 ? "var(--bg-card-hover)" : "transparent",
                  }}
                >
                  <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>
                    {formatTime(d.timestamp)}
                  </td>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>
                    {d.vrms.toFixed(6)}
                  </td>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>
                    {d.db_rel.toFixed(1)}
                  </td>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace", color: hasDbSPL ? "var(--accent-green)" : "var(--text)" }}>
                    {hasDbSPL ? d.dbSPL!.toFixed(1) : d.db_spl.toFixed(1)}
                  </td>
                </tr>
              );
            })}
            {lastRecords.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    padding: "24px",
                    textAlign: "center",
                    color: "var(--text-muted)",
                  }}
                >
                  Esperando datos...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default SoundMonitor;
