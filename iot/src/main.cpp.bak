// =============================================================================
// main.cpp — Punto de entrada del firmware Chavis IoT
//
// Arquitectura de arranque:
//   1. WifiManager intenta conectarse a redes guardadas en Flash.
//   2. Si hay internet → inicializa sensor de sonido + cliente Socket.IO.
//   3. Si no hay internet → WifiManager levanta el portal de configuración
//      y el dispositivo queda en ese estado hasta que el usuario configure
//      una red válida y el dispositivo reinicie automáticamente.
//
// La lógica principal NUNCA corre sin conexión a internet.
//
// Flujo del loop() con WiFi activo:
//   1. wifiManager.loop()    — mantiene conexión WiFi
//   2. socketClient.loop()   — procesa frames entrantes (ping/pong), reconecta
//   3. soundSensor.read()    — muestrea ADC 50ms, calcula Vrms + dB
//   4. socketClient.emit()   — envía datos al servidor Socket.IO
// =============================================================================

#include <Arduino.h>
#include <WifiManager.h>
#include <SoundSensor.h>
#include <SocketIoClient.h>

// ---------------------------------------------------------------------------
// Instancias globales
// ---------------------------------------------------------------------------
static WifiManager    wifiManager;
static SoundSensor    soundSensor;
static SocketIoClient socketClient;

// ---------------------------------------------------------------------------
// setup — Se ejecuta una sola vez al arrancar
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  // Esperar a que el puerto Serial esté listo (máx. 3 segundos).
  // En producción (alimentado por batería/fuente), no bloquea indefinidamente.
  while (!Serial && millis() < 3000UL) {
    ;
  }

  Serial.println("========================================");
  Serial.println("  Chavis IoT — Iniciando firmware");
  Serial.println("========================================");

  // Inicializar el subsistema WiFi.
  // Retorna true si hay internet disponible al finalizar.
  bool wifiReady = wifiManager.begin();

  if (wifiReady) {
    Serial.println("[MAIN] WiFi listo. Iniciando logica principal...");

    // Inicializar sensor de sonido (configura ADC a 12 bits)
    soundSensor.begin();

    // Conectar al servidor Socket.IO
    socketClient.connect(SIOC_HOST, SIOC_PORT);

  } else {
    Serial.println("[MAIN] Sin WiFi. Portal de configuracion activo.");
    Serial.println("[MAIN] Logica principal en espera.");
    // La lógica principal NO se inicializa.
    // El dispositivo permanece atendiendo el portal hasta que el usuario
    // configure una red y el dispositivo reinicie automáticamente.
  }
}

// ---------------------------------------------------------------------------
// loop — Se ejecuta continuamente
// ---------------------------------------------------------------------------
void loop() {
  // WifiManager debe correr siempre:
  //   - En modo CONNECTED:     verifica y mantiene la conexión activa.
  //   - En modo CONFIG_PORTAL: atiende el servidor HTTP del portal web.
  wifiManager.loop();

  // La lógica principal solo corre cuando hay internet.
  if (wifiManager.isConnected()) {

    // Mantener la conexión Socket.IO y procesar frames entrantes (ping/pong).
    socketClient.loop();

    // Leer el sensor de sonido (~50ms de bloqueo por ventana Welford).
    SoundSample sample = soundSensor.read();

    // Enviar datos al servidor solo si la muestra es válida y hay conexión.
    if (sample.ready && socketClient.isConnected()) {
      // Formato tab-separado: vrms\tdb_rel\tdb_spl
      // El servidor parseTabData() en index.ts espera exactamente este formato.
      char payload[64];
      snprintf(payload, sizeof(payload), "%.6f\t%.1f\t%.1f",
               sample.vrms, sample.db_rel, sample.db_spl);

      socketClient.emit("data", payload);

      // Eco por Serial para depuración (mismo formato que el código de referencia)
      Serial.println(payload);
    }
  }
}
