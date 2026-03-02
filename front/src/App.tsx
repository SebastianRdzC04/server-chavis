import { useEffect, useState, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import SoundMonitor from "./components/SoundMonitor";

export interface SoundData {
  vrms: number;
  db_rel: number;
  db_spl: number;
  timestamp: string;
}

const SOCKET_URL = "https://ws-chavis.devas-projects.sbs";

function App() {
  const [connected, setConnected] = useState(false);
  const [current, setCurrent] = useState<SoundData | null>(null);
  const [history, setHistory] = useState<SoundData[]>([]);
  const socketRef = useRef<Socket | null>(null);

  const MAX_HISTORY = 200;

  const addToHistory = useCallback((data: SoundData) => {
    setHistory((prev) => {
      const next = [...prev, data];
      if (next.length > MAX_HISTORY) {
        return next.slice(next.length - MAX_HISTORY);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[WS] Connected to server");
      setConnected(true);
      // Request last 100 records
      socket.emit("data:history", 100);
    });

    socket.on("disconnect", () => {
      console.log("[WS] Disconnected");
      setConnected(false);
    });

    socket.on("data:new", (data: SoundData) => {
      setCurrent(data);
      addToHistory(data);
    });

    socket.on("data:history", (records: SoundData[]) => {
      setHistory(records);
      if (records.length > 0) {
        setCurrent(records[records.length - 1]);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [addToHistory]);

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "32px",
        }}
      >
        <h1 style={{ fontSize: "24px", fontWeight: 700 }}>
          Chavis <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>Sound Monitor</span>
        </h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
          }}
        >
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: connected ? "var(--accent-green)" : "var(--accent-red)",
              display: "inline-block",
            }}
          />
          {connected ? "Conectado" : "Desconectado"}
        </div>
      </header>

      <SoundMonitor current={current} history={history} />
    </div>
  );
}

export default App;
