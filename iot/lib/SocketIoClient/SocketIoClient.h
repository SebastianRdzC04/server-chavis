#pragma once

// =============================================================================
// SocketIoClient.h — Cliente Socket.IO v4 sobre WebSocket para SAMD21
//
// Implementa el protocolo Socket.IO v4 (Engine.IO v4) manualmente usando
// WiFiClient de WiFiNINA, sin librerías externas adicionales.
//
// Protocolo resumido:
//   1. Handshake HTTP → WebSocket upgrade (RFC 6455)
//   2. Recibir paquete EIO "0" (OPEN) del servidor
//   3. Enviar paquete SIO "40" (CONNECT al namespace "/")
//   4. Para emitir datos: frame WS con payload 42["evento","datos"]
//   5. Responder PONG "3" a cada PING "2" del servidor
//
// Uso:
//   SocketIoClient client;
//   client.connect("ws-chavis.devas-projects.sbs", 1100);  // en setup()
//   client.loop();    // en loop() — procesa frames entrantes (ping/pong)
//   client.emit("data", "0.707\t23.5\t117.5");             // en loop()
//   client.isConnected();  // true si el handshake completó correctamente
//
// Restricciones de implementación:
//   - Frames WebSocket enviados sin máscara de cliente (simplificado).
//     El servidor Node.js/Socket.IO lo acepta en este modo.
//   - Payload máximo de emisión: SIOCC_MAX_PAYLOAD bytes.
//   - No soporta namespaces personalizados (solo "/").
//   - No soporta ACKs ni callbacks de respuesta.
// =============================================================================

#include <Arduino.h>
#include <WiFiNINA.h>

// ---------------------------------------------------------------------------
// Constantes de configuración
// ---------------------------------------------------------------------------

/** Host del servidor Socket.IO. */
#define SIOC_HOST               "ws-chavis.devas-projects.sbs"

/** Puerto del servidor Socket.IO. */
#define SIOC_PORT               80

/** Tiempo máximo esperando el handshake HTTP 101 (ms). */
#define SIOC_HANDSHAKE_TIMEOUT  5000UL

/** Tiempo máximo esperando datos en el buffer de lectura (ms). */
#define SIOC_READ_TIMEOUT       100UL

/** Tamaño máximo del payload de un emit (bytes). */
#define SIOC_MAX_PAYLOAD        128

/** Intervalo mínimo entre reconexiones automáticas (ms). */
#define SIOC_RECONNECT_INTERVAL 5000UL

// ---------------------------------------------------------------------------
// Clase SocketIoClient
// ---------------------------------------------------------------------------

class SocketIoClient {
public:
  // -------------------------------------------------------------------------
  // Establece la conexión al servidor Socket.IO.
  //
  // Realiza el handshake HTTP→WebSocket y el handshake Socket.IO (SIO CONNECT).
  // Retorna true si la conexión quedó lista para emitir eventos.
  // Si falla, deja el cliente en estado desconectado para que loop() reintente.
  //
  // Parámetros:
  //   host — hostname o IP del servidor (sin protocolo, sin puerto)
  //   port — puerto TCP
  // -------------------------------------------------------------------------
  bool connect(const char* host, uint16_t port);

  // -------------------------------------------------------------------------
  // Procesa frames WebSocket entrantes del servidor.
  //
  // Debe llamarse en cada iteración de loop():
  //   - Lee frames disponibles en el buffer TCP.
  //   - Responde PONG a los PING del servidor (necesario para no desconectarse).
  //   - Si la conexión se perdió, intenta reconectar tras SIOC_RECONNECT_INTERVAL.
  // -------------------------------------------------------------------------
  void loop();

  // -------------------------------------------------------------------------
  // Emite un evento Socket.IO al servidor.
  //
  // Genera el payload: 42["evento","datos"]
  // Lo envía como un frame WebSocket de texto.
  //
  // Retorna true si el frame se escribió correctamente en el buffer TCP.
  // Retorna false si no hay conexión activa (no intenta reconectar).
  // -------------------------------------------------------------------------
  bool emit(const char* event, const char* data);

  // -------------------------------------------------------------------------
  // Retorna true si el WebSocket está conectado y el handshake SIO completó.
  // -------------------------------------------------------------------------
  bool isConnected();

private:
  WiFiClient  _client;
  bool        _connected      = false;
  const char* _host           = nullptr;
  uint16_t    _port           = 0;
  unsigned long _lastReconnect = 0;

  // Realiza el upgrade HTTP → WebSocket (RFC 6455).
  // Retorna true si el servidor respondió 101 Switching Protocols.
  bool _httpUpgrade();

  // Lee la respuesta HTTP línea por línea hasta la línea vacía que indica
  // fin de headers. Retorna true si encontró "101 Switching Protocols".
  bool _readHttpResponse();

  // Envía el paquete Socket.IO CONNECT ("40") para unirse al namespace "/".
  void _sendSioConnect();

  // Lee y procesa todos los frames WebSocket disponibles en el buffer.
  // Responde PONG si recibe PING.
  void _processIncomingFrames();

  // Lee un frame WebSocket completo desde el cliente TCP.
  // Escribe el payload en buf (máx bufSize bytes, null-terminated).
  // Retorna la longitud del payload, o -1 si no hay frame disponible / error.
  int _readFrame(char* buf, size_t bufSize);

  // Envía un frame WebSocket de texto con el payload dado.
  // opcode: 0x01 = texto, 0x09 = ping, 0x0A = pong.
  void _sendFrame(uint8_t opcode, const char* payload, size_t len);

  // Envía un frame PONG de control.
  void _sendPong(const char* payload, size_t len);
};
