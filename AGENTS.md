# AGENTS.md — Chavis Sound Monitor

## Project Overview

Chavis is an IoT sound-monitoring system (monorepo) with three components:

| Component | Stack | Port | Purpose |
|-----------|-------|------|---------|
| `server/` | Node.js 20, TypeScript, Socket.IO, Mongoose | 1100 | WebSocket server: receives sound data from IoT, persists to MongoDB, broadcasts to clients |
| `front/` | React 19, TypeScript, Vite 6, Recharts, Socket.IO Client | 1101 | Real-time dashboard (cards, line charts, data table) |
| `iot/` | C++ / Arduino / PlatformIO (MKR WiFi 1010) | — | Microcontroller firmware: WiFiManager (config portal + Flash persistence) + sound sensor TODO stubs |
| `infra/` | Docker Compose, MongoDB 7, Nginx | 1100–1102 | Service orchestration |

Data flow: IoT device → Socket.IO `data` event (tab-separated) → Server (parse, save, re-emit `data:new`) → Frontend.

## Build / Dev / Start Commands

There is **no root-level package.json**. All commands run from the respective subdirectory.

### Server (`server/`)

```bash
npm install          # install dependencies
npm run dev          # start dev server with hot-reload (tsx watch)
npm run build        # compile TypeScript → dist/
npm start            # run production build (node dist/index.js)
```

TypeScript compilation: `npx tsc` (uses `server/tsconfig.json`, target ES2022, CommonJS).

### Frontend (`front/`)

```bash
npm install          # install dependencies
npm run dev          # start Vite dev server on port 1101
npm run build        # tsc -b && vite build
npm run preview      # preview production build
```

### Infrastructure (`infra/`)

```bash
docker compose up -d            # start all services (mongo, server, front)
docker compose up -d --build    # rebuild images and start
docker compose down             # stop all services
```

Services: `chavis-mongo` (:1102→27017), `chavis-server` (:1100), `chavis-front` (:1101).

### IoT (`iot/`)

Uses PlatformIO. Board: `mkrwifi1010`, framework: Arduino.

**PlatformIO executable is NOT in PATH** — always use the full path:
```bash
~/.platformio/penv/bin/pio run        # compile (run from iot/)
~/.platformio/penv/bin/pio run -t upload  # flash to board
~/.platformio/penv/bin/pio device monitor  # serial monitor
```

**Library dependencies** (in `platformio.ini`):
- `arduino-libraries/WiFiNINA` — WiFi connectivity for MKR WiFi 1010
- `khoih-prog/FlashStorage_SAMD@^1.3.2` — EEPROM emulation via Flash NVM (SAMD21 has no physical EEPROM)

**WifiManager library** (`iot/lib/WifiManager/`):

| File | Responsibility |
|------|----------------|
| `WifiConfig.h` | Types, structs (`WifiNetwork`, `DeviceConfig`), constants, `WifiState` enum |
| `WifiStorage.h` / `.cpp` | Flash persistence + circular FIFO queue (up to 3 networks). `FlashStorage_SAMD.h` included **only** in `.cpp` to avoid multiple-definition linker errors |
| `PortalHtml.h` | Full responsive dark-theme HTML in PROGMEM (`#include <Arduino.h>`, not `avr/pgmspace.h`) |
| `WifiPortal.h` / `.cpp` | Raw HTTP server: config portal with WiFi scan, URL decode, placeholder replacement |
| `WifiManager.h` / `.cpp` | Orchestrator: boot flow, circular network iteration, AP setup, `NVIC_SystemReset()` after save |

**Critical SAMD21 / FlashStorage_SAMD notes:**
- `FlashStorage(name, type)` macro **must** appear only in one `.cpp` file (not in any `.h`).
- `read()` takes a reference: `storage.read(config)` — does NOT return by value.
- `write()` takes `T&` (non-const): pass a mutable copy, not a `const T&`.
- Reset: `NVIC_SystemReset()` (ARM Cortex-M0+) — NOT `ESP.restart()` or AVR watchdog.
- `PROGMEM` / `pgm_read_byte()` provided by `Arduino.h` on SAMD — do NOT include `avr/pgmspace.h`.
- LSP errors (`Arduino.h` not found, etc.) are **false positives** — the host LSP lacks the PlatformIO toolchain. Use `pio run` to verify real errors.

## Testing

**No test framework is configured.** There are no test files, no Jest/Vitest configs, and no testing dependencies. If adding tests:

- For `server/`: prefer Vitest or Jest with `ts-jest`. Place tests in `server/src/__tests__/` or co-locate as `*.test.ts`.
- For `front/`: prefer Vitest (already uses Vite). Place tests in `front/src/__tests__/` or co-locate as `*.test.tsx`.

## Linting & Formatting

**No ESLint or Prettier is configured.** If adding:

- Follow the existing style (see conventions below).
- TypeScript strict mode is already enabled in both `tsconfig.json` files.

## Environment Variables

See `server/.env.example`:

```
MONGO_URI=mongodb://mongo:27017/chavis
PORT=1100
```

Never commit `.env` files. The `.gitignore` excludes `.env`, `.env.local`, `.env.production`.

## Code Style Conventions

### General

- **Language**: TypeScript (strict mode enabled in all tsconfigs).
- **Indentation**: 2 spaces.
- **Semicolons**: always.
- **Quotes**: double quotes (`"`).
- **Const by default**: use `const`; use `let` only when reassignment is needed; never `var`.
- **Comments**: Spanish for domain/business logic, English for technical comments.

### Naming

| Kind | Convention | Example |
|------|-----------|---------|
| Variables, functions | `camelCase` | `parseTabData`, `httpServer` |
| Types, interfaces, models, components | `PascalCase` | `SoundData`, `SoundDataModel`, `SoundMonitor` |
| Data/DB fields | `snake_case` | `db_rel`, `db_spl`, `vrms` |
| Constants (environment) | `UPPER_SNAKE_CASE` | `MONGO_URI`, `PORT` |

### Imports

- Use named imports: `import { Server } from "socket.io"`.
- Use default imports only for Node built-ins: `import http from "http"`.
- Group imports: Node built-ins first, then external packages, then local modules.
- No barrel exports — each file exports its own declarations individually.

### Functions

- **Module-level functions**: use `function` keyword (not arrow).
- **Callbacks and inline functions**: use arrow functions.
- **React components**: use `function` keyword with `default export`.

### Error Handling

- Use `async/await` with `try/catch` blocks.
- Log errors with **bracketed prefixes**: `[WS]`, `[DB]`, `[PARSE]`, `[SERVER]`.
- Use `console.warn` for recoverable issues, `console.error` for failures.
- Call `process.exit(1)` only on fatal startup errors (e.g., DB connection failure).
- Return `null` from parser functions on invalid input (don't throw).

### React / Frontend

- React 19 with **function components** only (no class components).
- Hooks: `useState`, `useEffect`, `useRef`, `useCallback`.
- Styling: **inline CSS** via `style={{}}` objects + CSS custom properties from `index.css`. No CSS modules, no styled-components, no Tailwind.
- Dark theme using CSS variables (`--bg`, `--text`, `--accent-blue`, etc.).
- Props defined via `interface Props { ... }`.
- Components use `default export`.

### Server / Backend

- Raw `http.createServer` + Socket.IO (no Express).
- Mongoose for MongoDB: explicit schemas, indexes, and named models.
- Parse incoming data defensively (validate, return null on bad input).
- Socket events: `data` (incoming), `data:new` (broadcast), `data:history` (request/response).

### Database

- MongoDB 7, accessed via Mongoose.
- Collection name: `data`. Model name: `SoundData`.
- Schema fields: `vrms` (Number), `db_rel` (Number), `db_spl` (Number), `timestamp` (Date, default `Date.now`).
- Index on `timestamp: -1` for efficient time-sorted queries.

## Docker

- Multi-stage builds: builder stage compiles, production stage runs with `--omit=dev`.
- Server image: `node:20-alpine`.
- Frontend image: `node:20-alpine` build → `nginx:alpine` serve.
- `.dockerignore` excludes `node_modules`, `dist`, `.env`.

## Key File Locations

```
server/src/index.ts    — Server entry point, Socket.IO event handlers
server/src/db.ts       — Mongoose connection and schema
server/src/types.ts    — Shared TypeScript interfaces
front/src/App.tsx      — Main React component, socket connection
front/src/components/  — UI components (SoundMonitor)
front/src/index.css    — Global styles and CSS variables
infra/docker-compose.yml — Docker orchestration
iot/src/main.cpp       — Firmware entry point (setup/loop, TODO stubs for sound sensor)
iot/lib/WifiManager/   — WiFi subsystem (see table above)
iot/platformio.ini     — PlatformIO config (board, libs, monitor speed)
```
