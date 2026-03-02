#pragma once

// =============================================================================
// WifiPortal.h — Servidor HTTP del portal de configuración WiFi
//
// Responsabilidad única: levantar y servir el portal web en modo AP.
// No conoce EEPROM directamente. Cuando el usuario guarda una red, invoca
// el callback SaveNetworkCallback que WifiManager le registra.
//
// Flujo HTTP (raw, sin librería externa):
//   GET  /        → sirve PortalHtml.h (3 partes) + datos precalculados
//   POST /save    → parsea body URL-encoded, invoca callback, envía respuesta
//   Cualquier otra ruta → redirect a /
//
// El escaneo WiFi se realiza ANTES de levantar el AP (en WifiManager) y se
// pasa a begin() como string ya construido. Así el AP nunca se interrumpe.
// =============================================================================

#include <WiFiNINA.h>
#include "WifiConfig.h"

// ---------------------------------------------------------------------------
// Tipo del callback que WifiPortal invoca al guardar una red.
// WifiManager implementa y registra esta función.
// ---------------------------------------------------------------------------
using SaveNetworkCallback = void (*)(const char* ssid, const char* pass);

class WifiPortal {
public:
  // ---------------------------------------------------------------------------
  // Inicializa el servidor HTTP en WIFI_PORTAL_PORT.
  // Debe llamarse DESPUÉS de WiFi.beginAP().
  //
  // cb:          función que se invocará cuando el usuario guarde una red.
  // netCount:    número de redes actualmente guardadas (para mostrar en HTML).
  // scanOptions: string con los <option> HTML de las redes escaneadas.
  //              Precalculado antes de beginAP() para no interrumpir el AP.
  // ---------------------------------------------------------------------------
  void begin(SaveNetworkCallback cb, uint8_t netCount, const String& scanOptions);

  // ---------------------------------------------------------------------------
  // Procesa clientes HTTP pendientes. Llamar desde WifiManager::loop().
  // No bloquea: retorna inmediatamente si no hay cliente disponible.
  // ---------------------------------------------------------------------------
  void loop();

  // ---------------------------------------------------------------------------
  // Retorna true si el portal está corriendo (begin() fue llamado).
  // ---------------------------------------------------------------------------
  bool isRunning() const;

private:
  WiFiServer          _server{WIFI_PORTAL_PORT};
  SaveNetworkCallback _onSave      = nullptr;
  uint8_t             _netCount    = 0;
  String              _scanOptions = "";
  bool                _running     = false;

  // Despacha un cliente: decide si es GET o POST
  void _handleClient(WiFiClient& client);

  // Sirve el portal HTML (GET /) en 3 partes desde PROGMEM
  void _servePortalPage(WiFiClient& client);

  // Envía un string PROGMEM al cliente en bloques de PORTAL_CHUNK bytes
  void _sendProgmem(WiFiClient& client, const char* progmemStr);

  // Procesa formulario (POST /save)
  void _handleSave(WiFiClient& client, const String& body);

  // Envía respuesta de redirección a /
  void _sendRedirect(WiFiClient& client);

  // Extrae el valor de un campo del body URL-encoded
  String _extractField(const String& body, const String& key);

  // Decodifica una cadena URL-encoded (% hex + '+' como espacio)
  String _urlDecode(const String& encoded);

  // Lee headers HTTP hasta la línea vacía. Devuelve Content-Length o 0.
  int _readHeaders(WiFiClient& client, String& requestLine);

  // Lee exactamente `length` bytes del cliente con timeout
  String _readBody(WiFiClient& client, int length);
};
