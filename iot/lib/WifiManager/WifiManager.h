#pragma once

// =============================================================================
// WifiManager.h — Orquestador del sistema WiFi
//
// Es el único punto de contacto entre main.cpp y el subsistema WiFi.
// Coordina WifiStorage (EEPROM) y WifiPortal (servidor HTTP) según el estado.
//
// Uso en main.cpp:
//   WifiManager wifiManager;
//   bool ok = wifiManager.begin();   // en setup()
//   wifiManager.loop();              // en loop()
//   if (wifiManager.isConnected()) { ... lógica principal ... }
// =============================================================================

#include <WiFiNINA.h>
#include "WifiConfig.h"
#include "WifiStorage.h"
#include "WifiPortal.h"

class WifiManager {
public:
  // ---------------------------------------------------------------------------
  // Inicializa el sistema WiFi completo.
  //
  // Flujo:
  //   1. Carga configuración desde EEPROM.
  //   2. Si hay redes guardadas, intenta conectarse en orden newest→oldest.
  //      Timeout: WIFI_CONNECT_TIMEOUT_MS por red.
  //   3. Si conecta → estado CONNECTED, retorna true.
  //   4. Si falla con todas (o no hay redes) → levanta AP + portal web,
  //      estado CONFIG_PORTAL, retorna false.
  //
  // Retorna true solo si hay conexión WiFi lista al terminar begin().
  // ---------------------------------------------------------------------------
  bool begin();

  // ---------------------------------------------------------------------------
  // Procesa el estado actual. Llamar cada iteración de loop() en main.cpp.
  //   CONNECTED     → verifica y reconecta automáticamente si se perdió la señal.
  //   CONFIG_PORTAL → atiende clientes del portal web.
  // ---------------------------------------------------------------------------
  void loop();

  // ---------------------------------------------------------------------------
  // Retorna true si el estado actual es CONNECTED y WiFi.status() == WL_CONNECTED.
  // Usar en main.cpp para proteger la lógica principal.
  // ---------------------------------------------------------------------------
  bool isConnected() const;

  // ---------------------------------------------------------------------------
  // Retorna el estado interno actual (BOOTING, CONNECTING, CONNECTED, CONFIG_PORTAL).
  // ---------------------------------------------------------------------------
  WifiState getState() const;

  // ---------------------------------------------------------------------------
  // Retorna la IP local asignada (válida solo en modo CONNECTED).
  // ---------------------------------------------------------------------------
  IPAddress localIP() const;

private:
  DeviceConfig _config;
  WifiState    _state = WifiState::BOOTING;
  WifiPortal   _portal;

  // Intenta conectarse a todas las redes guardadas en orden newest→oldest.
  // Retorna true si logra conexión con alguna.
  bool _connectSavedNetworks();

  // Intenta conectarse a una red específica. Usa millis() para timeout no-bloqueante.
  // Retorna true si WiFi.status() == WL_CONNECTED dentro de WIFI_CONNECT_TIMEOUT_MS.
  bool _tryConnect(const WifiNetwork& net);

  // Levanta el Access Point y arranca el portal web.
  void _startConfigPortal();

  // Verifica la conexión y reconecta si se perdió. Si falla → vuelve a CONFIG_PORTAL.
  void _maintainConnection();

  // ---------------------------------------------------------------------------
  // Callback estático para WifiPortal.
  // C++ no permite pasar métodos no-estáticos directamente como punteros de función.
  // _instance apunta a la instancia activa para bridgear al método de instancia.
  // ---------------------------------------------------------------------------
  static WifiManager* _instance;
  static void         _saveCallback(const char* ssid, const char* pass);

  // Método de instancia real invocado por _saveCallback
  void _onNetworkSaved(const char* ssid, const char* pass);
};
