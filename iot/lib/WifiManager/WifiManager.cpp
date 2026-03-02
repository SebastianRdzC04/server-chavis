// =============================================================================
// WifiManager.cpp — Implementación del orquestador del sistema WiFi
// =============================================================================

#include "WifiManager.h"
// WifiStorage.h ya incluye FlashStorage_SAMD. WifiManager no accede
// directamente a Flash; toda la persistencia va por WifiStorage::*.

// Inicialización del puntero estático (singleton pattern para el callback)
WifiManager* WifiManager::_instance = nullptr;

// ---------------------------------------------------------------------------
// begin — Punto de entrada principal. Ejecutar una sola vez en setup().
// ---------------------------------------------------------------------------
bool WifiManager::begin() {
  _instance = this;
  _state    = WifiState::BOOTING;

  Serial.println("[WiFi] Iniciando WifiManager...");

  // Comprobar módulo WiFiNINA
  if (WiFi.status() == WL_NO_MODULE) {
    Serial.println("[WiFi] ERROR: Modulo WiFiNINA no encontrado. Verificar hardware.");
    // Sin módulo WiFi no podemos hacer nada. Bloqueamos aquí para evitar
    // comportamiento indefinido en la lógica principal.
    while (true) {
      delay(1000);
    }
  }

  // Cargar configuración desde EEPROM
  WifiStorage::load(_config);

  // Si no hay redes configuradas, ir directo al portal
  if (_config.networkCount == 0) {
    Serial.println("[WiFi] Sin redes guardadas. Iniciando portal de configuracion.");
    _startConfigPortal();
    return false;
  }

  // Intentar conectarse a las redes guardadas
  _state = WifiState::CONNECTING;
  if (_connectSavedNetworks()) {
    return true;
  }

  // Todas las redes fallaron
  Serial.println("[WiFi] No se pudo conectar a ninguna red guardada.");
  _startConfigPortal();
  return false;
}

// ---------------------------------------------------------------------------
// loop — Procesa el estado actual. Llamar cada iteración de loop() en main.cpp.
// ---------------------------------------------------------------------------
void WifiManager::loop() {
  switch (_state) {
    case WifiState::CONNECTED:
      _maintainConnection();
      break;

    case WifiState::CONFIG_PORTAL:
      _portal.loop();
      break;

    default:
      // BOOTING / CONNECTING: no debería llegar aquí en loop()
      break;
  }
}

// ---------------------------------------------------------------------------
// isConnected — Verifica si hay conexión WiFi activa
// ---------------------------------------------------------------------------
bool WifiManager::isConnected() const {
  return _state == WifiState::CONNECTED && WiFi.status() == WL_CONNECTED;
}

WifiState WifiManager::getState() const {
  return _state;
}

IPAddress WifiManager::localIP() const {
  return WiFi.localIP();
}

// ---------------------------------------------------------------------------
// _connectSavedNetworks — Itera redes en orden newest→oldest
// ---------------------------------------------------------------------------
bool WifiManager::_connectSavedNetworks() {
  Serial.print("[WiFi] Intentando ");
  Serial.print(_config.networkCount);
  Serial.println(" red(es) guardada(s)...");

  for (uint8_t orden = 0; orden < _config.networkCount; orden++) {
    int8_t idx = WifiStorage::getNetworkIndex(_config, orden);
    if (idx < 0) continue;

    const WifiNetwork& net = _config.networks[idx];

    // Omitir slots con SSID vacío (no deberían existir, pero por seguridad)
    if (net.ssid[0] == '\0') continue;

    Serial.print("[WiFi] [");
    Serial.print(orden + 1);
    Serial.print("/");
    Serial.print(_config.networkCount);
    Serial.print("] Conectando a: ");
    Serial.println(net.ssid);

    if (_tryConnect(net)) {
      _state = WifiState::CONNECTED;
      Serial.print("[WiFi] Conectado! IP: ");
      Serial.println(WiFi.localIP());
      return true;
    }

    Serial.print("[WiFi] Fallo en red: ");
    Serial.println(net.ssid);
  }

  return false;
}

// ---------------------------------------------------------------------------
// _tryConnect — Intenta conectarse a una red con timeout no-bloqueante
// ---------------------------------------------------------------------------
bool WifiManager::_tryConnect(const WifiNetwork& net) {
  // La password puede ser vacía (red abierta)
  if (strlen(net.password) > 0) {
    WiFi.begin(net.ssid, net.password);
  } else {
    WiFi.begin(net.ssid);
  }

  unsigned long startMs = millis();
  Serial.print("[WiFi] Esperando conexion");

  while (millis() - startMs < WIFI_CONNECT_TIMEOUT_MS) {
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println(" OK");
      return true;
    }
    delay(WIFI_CONNECT_POLL_MS);
    Serial.print(".");
  }

  Serial.println(" TIMEOUT");
  WiFi.disconnect();
  return false;
}

// ---------------------------------------------------------------------------
// _startConfigPortal — Levanta el AP y arranca el portal web
//
// El escaneo WiFi se realiza ANTES de WiFi.beginAP() para evitar que la
// interrupción del canal corte el AP mientras un cliente está conectado.
// El resultado se pasa a _portal.begin() como string ya construido.
// ---------------------------------------------------------------------------
void WifiManager::_startConfigPortal() {
  _state = WifiState::CONFIG_PORTAL;

  // ---- 1. Escanear redes ANTES de levantar el AP -------------------------
  // Desconectarse para liberar el canal y permitir un escaneo limpio.
  WiFi.disconnect();
  delay(200);

  Serial.println("[WiFi] Escaneando redes disponibles...");
  int numNets = WiFi.scanNetworks();

  String scanOptions = "";
  if (numNets <= 0) {
    Serial.println("[WiFi] No se encontraron redes.");
  } else {
    Serial.print("[WiFi] Redes encontradas: ");
    Serial.println(numNets);
    for (int i = 0; i < numNets; i++) {
      scanOptions += "<option value=\"";
      scanOptions += WiFi.SSID(i);
      scanOptions += "\">";
      scanOptions += WiFi.SSID(i);
      scanOptions += " (";
      scanOptions += WiFi.RSSI(i);
      scanOptions += " dBm)</option>";
    }
  }

  // ---- 2. Levantar el AP -------------------------------------------------
  Serial.print("[WiFi] Levantando Access Point: ");
  Serial.println(WIFI_AP_SSID);

  int apStatus = WiFi.beginAP(WIFI_AP_SSID);
  if (apStatus != WL_AP_LISTENING) {
    Serial.println("[WiFi] ERROR al crear Access Point. Reintentando...");
    delay(2000);
    apStatus = WiFi.beginAP(WIFI_AP_SSID);
  }

  // Esperar a que el AP esté listo
  unsigned long t = millis();
  while (WiFi.status() != WL_AP_LISTENING && (millis() - t) < 5000UL) {
    delay(100);
  }

  Serial.print("[WiFi] AP activo. IP del portal: ");
  Serial.println(WiFi.localIP());
  Serial.println("[WiFi] Conectate a 'Arduino-Setup' y abre http://192.168.4.1");

  // ---- 3. Iniciar portal con las opciones ya construidas -----------------
  _portal.begin(_saveCallback, _config.networkCount, scanOptions);
}

// ---------------------------------------------------------------------------
// _maintainConnection — Reconexión automática si se pierde la señal
// ---------------------------------------------------------------------------
void WifiManager::_maintainConnection() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println("[WiFi] Conexion perdida. Intentando reconectar...");

  if (_connectSavedNetworks()) {
    Serial.println("[WiFi] Reconectado exitosamente.");
    return;
  }

  // Si falla la reconexión, levantar el portal de configuración
  Serial.println("[WiFi] Reconexion fallida. Volviendo al portal de configuracion.");
  _startConfigPortal();
}

// ---------------------------------------------------------------------------
// _saveCallback — Wrapper estático → bridgea a _onNetworkSaved() de instancia
// ---------------------------------------------------------------------------
void WifiManager::_saveCallback(const char* ssid, const char* pass) {
  if (_instance != nullptr) {
    _instance->_onNetworkSaved(ssid, pass);
  }
}

// ---------------------------------------------------------------------------
// _onNetworkSaved — Guarda la nueva red en EEPROM y reinicia el dispositivo
// ---------------------------------------------------------------------------
void WifiManager::_onNetworkSaved(const char* ssid, const char* pass) {
  Serial.print("[WiFi] Guardando red: ");
  Serial.println(ssid);

  // Agregar a la cola circular (reemplaza la más antigua si está lleno)
  WifiStorage::addNetwork(_config, ssid, pass);

  // Persistir en EEPROM
  WifiStorage::save(_config);

  Serial.println("[WiFi] Red guardada. Reiniciando dispositivo...");
  delay(200);

  // Reset de hardware ARM Cortex-M0+ (SAMD21)
  NVIC_SystemReset();
}
