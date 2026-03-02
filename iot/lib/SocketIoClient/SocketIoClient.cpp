// =============================================================================
// SocketIoClient.cpp — Implementación del cliente Socket.IO v4 para SAMD21
//
// Protocolo implementado (Socket.IO v4 / Engine.IO v4):
//
//   HANDSHAKE:
//     1. TCP connect al host:port
//     2. HTTP GET /socket.io/?EIO=4&transport=websocket con headers WebSocket
//     3. Servidor responde "HTTP/1.1 101 Switching Protocols"
//     4. Servidor envía frame WS con payload "0{...}" (EIO OPEN)
//     5. Cliente envía frame WS con payload "40" (SIO CONNECT namespace "/")
//     6. Servidor confirma con "40" o "40{...}" (SIO CONNECT ACK)
//
//   OPERACIÓN NORMAL:
//     - emit("evento", "datos") → frame WS: 42["evento","datos"]
//     - Servidor envía "2" (EIO PING) periódicamente
//     - Cliente responde "3" (EIO PONG) inmediatamente
//
//   FRAMES WEBSOCKET (RFC 6455, simplificado):
//     Byte 0: 0x81 (FIN=1, opcode=0x1 texto) | 0x88 (close) | 0x89 (ping) | 0x8A (pong)
//     Byte 1: longitud del payload (sin máscara de cliente — simplificado)
//     Bytes N: payload
//
// Nota sobre máscaras:
//   RFC 6455 §5.3 requiere que los frames del cliente lleven máscara.
//   Sin embargo, el servidor Socket.IO Node.js (ws library) acepta frames
//   sin máscara en conexiones de dispositivos embebidos. Se omite por
//   simplicidad y para ahorrar RAM/CPU en el SAMD21.
// =============================================================================

#include "SocketIoClient.h"
#include <string.h>  // strlen, strstr, strncpy

// ---------------------------------------------------------------------------
// connect — Establece la conexión completa (TCP + WebSocket + SIO handshake)
// ---------------------------------------------------------------------------
bool SocketIoClient::connect(const char* host, uint16_t port) {
  _host = host;
  _port = port;
  _connected = false;

  Serial.print("[SIO] Conectando a ");
  Serial.print(host);
  Serial.print(":");
  Serial.println(port);

  if (!_client.connect(host, port)) {
    Serial.println("[SIO] Error: no se pudo abrir conexion TCP.");
    return false;
  }

  if (!_httpUpgrade()) {
    _client.stop();
    Serial.println("[SIO] Error: fallo el upgrade WebSocket.");
    return false;
  }

  // Esperar el paquete EIO OPEN "0{...}" del servidor
  char buf[256];
  unsigned long t0 = millis();
  bool gotOpen = false;

  while (millis() - t0 < SIOC_HANDSHAKE_TIMEOUT) {
    int len = _readFrame(buf, sizeof(buf));
    if (len > 0) {
      // El paquete EIO OPEN empieza con '0'
      if (buf[0] == '0') {
        gotOpen = true;
        Serial.print("[SIO] EIO OPEN recibido: ");
        Serial.println(buf);
        break;
      }
    }
    delay(10);
  }

  if (!gotOpen) {
    Serial.println("[SIO] Error: no se recibio EIO OPEN.");
    _client.stop();
    return false;
  }

  // Enviar SIO CONNECT "40"
  _sendSioConnect();

  // Esperar confirmación SIO CONNECT "40" o "40{...}" del servidor
  t0 = millis();
  bool gotConnectAck = false;

  while (millis() - t0 < SIOC_HANDSHAKE_TIMEOUT) {
    int len = _readFrame(buf, sizeof(buf));
    if (len > 0) {
      // SIO CONNECT ACK empieza con "40"
      if (buf[0] == '4' && buf[1] == '0') {
        gotConnectAck = true;
        Serial.println("[SIO] SIO CONNECT ACK recibido. Socket.IO listo.");
        break;
      }
      // Podría llegar otro ping antes — ignorar y seguir esperando
    }
    delay(10);
  }

  if (!gotConnectAck) {
    // Algunos servidores Socket.IO no envían el ACK explícito inmediatamente
    // pero la conexión ya está operativa. Lo consideramos exitoso de todas formas.
    Serial.println("[SIO] Aviso: no se recibio ACK explicito SIO CONNECT. Continuando.");
  }

  _connected = true;
  Serial.println("[SIO] Conectado y listo.");
  return true;
}

// ---------------------------------------------------------------------------
// loop — Procesar frames entrantes y mantener la conexión
// ---------------------------------------------------------------------------
void SocketIoClient::loop() {
  if (!_client.connected()) {
    if (_connected) {
      Serial.println("[SIO] Conexion perdida.");
      _connected = false;
    }

    // Reintentar reconexión tras el intervalo configurado
    unsigned long now = millis();
    if (now - _lastReconnect >= SIOC_RECONNECT_INTERVAL) {
      _lastReconnect = now;
      Serial.println("[SIO] Reintentando conexion...");
      connect(_host, _port);
    }
    return;
  }

  _processIncomingFrames();
}

// ---------------------------------------------------------------------------
// emit -- Enviar evento Socket.IO al servidor
//   Formato: 42["evento","datos"]
//
// El payload se escapa para JSON valido: tabs => \t, comillas => \", etc.
// RFC 8259 S7: los caracteres de control (U+0000-U+001F) dentro de strings
// JSON deben estar escapados. Un tab literal (0x09) hace que el servidor
// cierre la conexion con un WebSocket Close frame (opcode 8).
// ---------------------------------------------------------------------------
bool SocketIoClient::emit(const char* event, const char* data) {
  if (!_connected || !_client.connected()) {
    return false;
  }

  // Escapar el payload para JSON valido: tab=>\t, CR=>\r, LF=>\n, comilla=>\"
  char escaped[SIOC_MAX_PAYLOAD];
  size_t j = 0;
  for (size_t i = 0; data[i] != '\0' && j < sizeof(escaped) - 3; i++) {
    unsigned char c = (unsigned char)data[i];
    if (c == '\t') {
      escaped[j++] = '\\'; escaped[j++] = 't';
    } else if (c == '\n') {
      escaped[j++] = '\\'; escaped[j++] = 'n';
    } else if (c == '\r') {
      escaped[j++] = '\\'; escaped[j++] = 'r';
    } else if (c == '"') {
      escaped[j++] = '\\'; escaped[j++] = '"';
    } else if (c == '\\') {
      escaped[j++] = '\\'; escaped[j++] = '\\';
    } else {
      escaped[j++] = (char)c;
    }
  }
  escaped[j] = '\0';

  // Construir payload: 42["evento","datos_escapados"]
  char payload[SIOC_MAX_PAYLOAD];
  snprintf(payload, sizeof(payload), "42[\"%s\",\"%s\"]", event, escaped);

  size_t len = strlen(payload);
  _sendFrame(0x01, payload, len);  // opcode 0x01 = texto

  return true;
}

// ---------------------------------------------------------------------------
// isConnected — Estado de la conexión
// ---------------------------------------------------------------------------
bool SocketIoClient::isConnected() {
  return _connected && _client.connected();
}

// ===========================================================================
// PRIVADOS
// ===========================================================================

// ---------------------------------------------------------------------------
// _httpUpgrade — Envía el request HTTP WebSocket Upgrade y verifica respuesta
// ---------------------------------------------------------------------------
bool SocketIoClient::_httpUpgrade() {
  // Construir el request de upgrade
  // Sec-WebSocket-Key: 16 bytes en Base64. Usamos una key fija válida.
  _client.println("GET /socket.io/?EIO=4&transport=websocket HTTP/1.1");
  _client.print("Host: ");
  _client.println(_host);
  _client.println("Upgrade: websocket");
  _client.println("Connection: Upgrade");
  _client.println("Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==");
  _client.println("Sec-WebSocket-Version: 13");
  _client.println("Origin: http://arduino");
  _client.println();  // línea vacía → fin de headers

  return _readHttpResponse();
}

// ---------------------------------------------------------------------------
// _readHttpResponse — Lee la respuesta HTTP y verifica código 101
// ---------------------------------------------------------------------------
bool SocketIoClient::_readHttpResponse() {
  unsigned long t0 = millis();
  char line[128];
  bool got101 = false;
  bool headersDone = false;

  while (!headersDone && millis() - t0 < SIOC_HANDSHAKE_TIMEOUT) {
    if (_client.available()) {
      // Leer línea hasta \n
      int idx = 0;
      while (_client.available() && idx < (int)sizeof(line) - 1) {
        char c = (char)_client.read();
        if (c == '\n') break;
        if (c != '\r') line[idx++] = c;
      }
      line[idx] = '\0';

      if (idx == 0) {
        // Línea vacía = fin de headers HTTP
        headersDone = true;
        break;
      }

      // Verificar la primera línea de la respuesta
      if (strstr(line, "101") != nullptr) {
        got101 = true;
        Serial.println("[SIO] HTTP 101 Switching Protocols OK.");
      }
    }
    delay(1);
  }

  return got101;
}

// ---------------------------------------------------------------------------
// _sendSioConnect — Envía el paquete SIO CONNECT "40" al namespace "/"
// ---------------------------------------------------------------------------
void SocketIoClient::_sendSioConnect() {
  const char* sioConnect = "40";
  _sendFrame(0x01, sioConnect, strlen(sioConnect));
  Serial.println("[SIO] SIO CONNECT enviado.");
}

// ---------------------------------------------------------------------------
// _processIncomingFrames — Lee y procesa frames WebSocket disponibles
// ---------------------------------------------------------------------------
void SocketIoClient::_processIncomingFrames() {
  char buf[128];

  while (_client.available()) {
    int len = _readFrame(buf, sizeof(buf));
    if (len <= 0) break;

    // EIO PING "2" → responder PONG "3"
    if (len == 1 && buf[0] == '2') {
      _sendPong("3", 1);
      Serial.println("[SIO] PING recibido, PONG enviado.");
    }
    // SIO DISCONNECT "41" — el servidor cerró el namespace
    else if (len >= 2 && buf[0] == '4' && buf[1] == '1') {
      Serial.println("[SIO] SIO DISCONNECT recibido del servidor.");
      _connected = false;
      _client.stop();
    }
    // EIO CLOSE "1"
    else if (len == 1 && buf[0] == '1') {
      Serial.println("[SIO] EIO CLOSE recibido del servidor.");
      _connected = false;
      _client.stop();
    }
    // Otros paquetes (mensajes entrantes, ACKs): ignorar silenciosamente
  }
}

// ---------------------------------------------------------------------------
// _readFrame — Lee un frame WebSocket del buffer TCP
//
// Formato frame WebSocket (RFC 6455):
//   Byte 0: FIN(1) + RSV(3) + opcode(4)
//   Byte 1: MASK(1) + payload_len(7)
//   [Bytes 2-3: extended_payload_len si payload_len==126]
//   [Bytes 2-9: extended_payload_len si payload_len==127]
//   [Bytes: masking_key si MASK==1]
//   Bytes: payload data
//
// Retorna longitud del payload leído, o -1 si no hay frame o error.
// ---------------------------------------------------------------------------
int SocketIoClient::_readFrame(char* buf, size_t bufSize) {
  if (!_client.available()) return -1;

  // Byte 0: FIN + opcode
  int b0 = _client.read();
  if (b0 < 0) return -1;

  // uint8_t opcode = b0 & 0x0F;  // no lo usamos pero está implícito

  // Byte 1: MASK + payload_len
  if (!_client.available()) return -1;
  int b1 = _client.read();
  if (b1 < 0) return -1;

  bool masked = (b1 & 0x80) != 0;
  size_t payloadLen = (size_t)(b1 & 0x7F);

  // Extended payload length (16-bit)
  if (payloadLen == 126) {
    if (!_client.available()) return -1;
    int hi = _client.read();
    if (!_client.available()) return -1;
    int lo = _client.read();
    payloadLen = ((size_t)hi << 8) | (size_t)lo;
  }
  // No manejamos payload_len == 127 (64-bit) — demasiado grande para este dispositivo

  // Masking key (4 bytes), solo si el frame viene enmascarado (servidor → cliente: normalmente NO)
  uint8_t maskKey[4] = {0, 0, 0, 0};
  if (masked) {
    for (int i = 0; i < 4; i++) {
      if (!_client.available()) return -1;
      int b = _client.read();
      if (b < 0) return -1;
      maskKey[i] = (uint8_t)b;
    }
  }

  // Leer payload (limitado a bufSize - 1 para null-terminator)
  size_t toRead = (payloadLen < bufSize - 1) ? payloadLen : bufSize - 1;
  size_t bytesRead = 0;

  unsigned long t0 = millis();
  while (bytesRead < toRead && millis() - t0 < SIOC_READ_TIMEOUT) {
    if (_client.available()) {
      int b = _client.read();
      if (b < 0) break;
      buf[bytesRead] = masked
        ? (char)((uint8_t)b ^ maskKey[bytesRead % 4])
        : (char)b;
      bytesRead++;
    }
  }

  // Descartar bytes restantes del payload que no entraron en buf
  size_t remaining = payloadLen - bytesRead;
  t0 = millis();
  while (remaining > 0 && millis() - t0 < SIOC_READ_TIMEOUT) {
    if (_client.available()) {
      _client.read();
      remaining--;
    }
  }

  buf[bytesRead] = '\0';
  return (int)bytesRead;
}

// ---------------------------------------------------------------------------
// _sendFrame — Envía un frame WebSocket de texto CON máscara de cliente
//
// RFC 6455 §5.3: los frames del cliente DEBEN ir enmascarados.
// El servidor Node.js/ws rechaza frames sin máscara y no envía el SIO ACK.
//
// Máscara: 4 bytes pseudo-aleatorios generados con millis() + contador.
// No necesita ser criptográficamente seguro — solo cumplir con el protocolo.
//
// Formato del frame enmascarado:
//   Byte 0: FIN=1, RSV=0, opcode
//   Byte 1: MASK=1, payload_length (7 bits)
//   [Bytes 2-3: extended_payload_len si len == 126]
//   Bytes 4-7: masking_key (4 bytes)
//   Bytes 8+:  payload XOR masking_key
// ---------------------------------------------------------------------------
void SocketIoClient::_sendFrame(uint8_t opcode, const char* payload, size_t len) {
  // Generar máscara pseudo-aleatoria con millis() + contador rotativo
  static uint8_t _maskCounter = 0;
  unsigned long t = millis();
  uint8_t mask[4] = {
    (uint8_t)(((uint8_t)( t        & 0xFF)) ^ _maskCounter),
    (uint8_t)(((uint8_t)((t >>  8) & 0xFF)) ^ (uint8_t)(len & 0xFF)),
    (uint8_t)(((uint8_t)((t >> 16) & 0xFF)) ^ (uint8_t)(opcode)),
    (uint8_t)(((uint8_t)((t >> 24) & 0xFF)) ^ (uint8_t)(++_maskCounter)),
  };

  // Byte 0: FIN=1, RSV=0, opcode
  _client.write((uint8_t)(0x80 | opcode));

  // Byte 1: MASK=1, payload length
  if (len <= 125) {
    _client.write((uint8_t)(0x80 | len));
  } else if (len <= 65535) {
    _client.write((uint8_t)(0x80 | 126));
    _client.write((uint8_t)((len >> 8) & 0xFF));
    _client.write((uint8_t)(len & 0xFF));
  }

  // Masking key (4 bytes)
  _client.write(mask, 4);

  // Payload enmascarado: cada byte XOR con la clave circular
  for (size_t i = 0; i < len; i++) {
    _client.write((uint8_t)((uint8_t)payload[i] ^ mask[i % 4]));
  }
}

// ---------------------------------------------------------------------------
// _sendPong — Envía EIO PONG como frame WebSocket de TEXTO (opcode 0x01)
//
// Socket.IO / Engine.IO usa PING "2" y PONG "3" como frames de texto,
// NO como WebSocket Ping/Pong de control (opcode 0x09/0x0A).
// Usar 0x0A hace que el servidor ignore el pong y cierre la conexión
// por timeout de pingTimeout (20s).
// ---------------------------------------------------------------------------
void SocketIoClient::_sendPong(const char* payload, size_t len) {
  _sendFrame(0x01, payload, len);  // opcode texto, payload "3"
}
