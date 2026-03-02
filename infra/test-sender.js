const { io } = require("socket.io-client");

const SOCKET_URL = process.env.SOCKET_URL || "https://ws-chavis.devas-projects.sbs";
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || "500");

console.log(`[TEST] Connecting to ${SOCKET_URL}...`);
console.log(`[TEST] Interval: ${INTERVAL_MS}ms`);

let intervalId = null;
const socket = io(SOCKET_URL, {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

function startSending() {
  if (intervalId) return; // already sending
  intervalId = setInterval(() => {
    try {
      const vrms = (Math.random() * 2).toFixed(6);
      const db_rel = (Math.random() * 60).toFixed(1);
      const db_spl = (30 + Math.random() * 110).toFixed(1);
      const payload = `${vrms}\t${db_rel}\t${db_spl}`;

      socket.emit("data", payload);
      console.log(`[TEST] Sent: vrms=${vrms}  db_rel=${db_rel}  db_spl=${db_spl}`);
    } catch (err) {
      console.error('[TEST] Error sending payload', err);
    }
  }, INTERVAL_MS);
}

function stopSending() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

socket.on("connect", () => {
  console.log(`[TEST] Connected! Socket ID: ${socket.id}`);
  startSending();
});

socket.on("reconnect", (attempt) => {
  console.log(`[TEST] Reconnected after ${attempt} attempts`);
  startSending();
});

socket.on("disconnect", (reason) => {
  console.log(`[TEST] Disconnected: ${reason}`);
  // keep trying to reconnect; stop sending until reconnected
  stopSending();
});

socket.on("connect_error", (err) => {
  console.error(`[TEST] Connection error: ${err && err.message}`);
});

socket.on("data:new", (data) => {
  console.log(`[TEST] Confirmed saved:`, data);
});

process.on('uncaughtException', (err) => {
  console.error('[TEST] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[TEST] Unhandled Rejection:', reason);
});

// ensure process keeps running
process.stdin.resume();
