// =============================================================================
// WifiPortal.cpp — Implementación del servidor HTTP del portal de configuración
// =============================================================================

#include "WifiPortal.h"
#include "PortalHtml.h"
#include <string.h>

// ---------------------------------------------------------------------------
// begin — Inicializa el servidor HTTP
//
// scanOptions: string con <option> HTML precalculado ANTES de beginAP().
//              Se almacena en _scanOptions para usarlo al servir GET /.
// ---------------------------------------------------------------------------
void WifiPortal::begin(SaveNetworkCallback cb, uint8_t netCount, const String& scanOptions) {
  _onSave      = cb;
  _netCount    = netCount;
  _scanOptions = scanOptions;
  _server.begin();
  _running     = true;
  Serial.print("[PORTAL] Servidor HTTP activo en puerto ");
  Serial.println(WIFI_PORTAL_PORT);
}

// ---------------------------------------------------------------------------
// loop — Atiende clientes pendientes (no bloqueante)
// ---------------------------------------------------------------------------
void WifiPortal::loop() {
  if (!_running) return;

  WiFiClient client = _server.available();
  if (!client) return;

  Serial.println("[PORTAL] Cliente conectado.");
  _handleClient(client);
  client.stop();
  Serial.println("[PORTAL] Cliente desconectado.");
}

bool WifiPortal::isRunning() const {
  return _running;
}

// ---------------------------------------------------------------------------
// _handleClient — Lee la primera línea del request y despacha
// ---------------------------------------------------------------------------
void WifiPortal::_handleClient(WiFiClient& client) {
  String requestLine;
  int contentLength = _readHeaders(client, requestLine);

  Serial.print("[PORTAL] Request: ");
  Serial.println(requestLine);

  if (requestLine.startsWith("POST") && requestLine.indexOf("/save") >= 0) {
    String body = _readBody(client, contentLength);
    Serial.print("[PORTAL] Body recibido: ");
    Serial.println(body);
    _handleSave(client, body);

  } else if (requestLine.startsWith("GET")) {
    _servePortalPage(client);

  } else {
    // Cualquier otra ruta → redirect a raíz
    _sendRedirect(client);
  }
}

// ---------------------------------------------------------------------------
// _readHeaders — Lee headers hasta línea vacía, extrae Content-Length
// ---------------------------------------------------------------------------
int WifiPortal::_readHeaders(WiFiClient& client, String& requestLine) {
  int contentLength = 0;
  bool firstLine    = true;
  unsigned long t   = millis();

  while (client.connected() && (millis() - t) < WIFI_CLIENT_TIMEOUT_MS) {
    if (!client.available()) {
      delay(1);
      continue;
    }

    String line = client.readStringUntil('\n');
    line.trim();

    if (firstLine) {
      requestLine = line;
      firstLine   = false;
    }

    if (line.startsWith("Content-Length:") || line.startsWith("content-length:")) {
      int colonIdx = line.indexOf(':');
      if (colonIdx >= 0) {
        contentLength = line.substring(colonIdx + 1).toInt();
      }
    }

    // Línea vacía = fin de headers
    if (line.length() == 0) break;
  }

  return contentLength;
}

// ---------------------------------------------------------------------------
// _readBody — Lee exactamente `length` bytes del body con timeout
// ---------------------------------------------------------------------------
String WifiPortal::_readBody(WiFiClient& client, int length) {
  if (length <= 0) return "";

  String body = "";
  body.reserve(length);
  unsigned long t = millis();

  while ((int)body.length() < length &&
         client.connected() &&
         (millis() - t) < WIFI_CLIENT_TIMEOUT_MS) {
    if (client.available()) {
      body += (char)client.read();
    } else {
      delay(1);
    }
  }

  return body;
}

// ---------------------------------------------------------------------------
// _servePortalPage — Sirve el HTML del portal en 3 partes desde PROGMEM
//
// Secuencia de envío:
//   1. PORTAL_HTML_PART1   (hasta antes del contador de redes)
//   2. String(_netCount)   (ej. "2")
//   3. PORTAL_HTML_PART2   (hasta antes de los <option>)
//   4. _scanOptions        (string con <option> precalculado)
//   5. PORTAL_HTML_PART3   (resto del HTML)
//
// No hay búsqueda de placeholders en runtime — solo concatenación secuencial.
// El HTML vive en Flash; solo PORTAL_CHUNK bytes se copian a RAM a la vez.
// ---------------------------------------------------------------------------
void WifiPortal::_servePortalPage(WiFiClient& client) {
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: text/html; charset=utf-8");
  client.println("Connection: close");
  client.println();

  _sendProgmem(client, PORTAL_HTML_PART1);
  client.print(_netCount);
  _sendProgmem(client, PORTAL_HTML_PART2);
  client.print(_scanOptions);
  _sendProgmem(client, PORTAL_HTML_PART3);
}

// ---------------------------------------------------------------------------
// _sendProgmem — Envía un string PROGMEM al cliente en bloques de PORTAL_CHUNK
// ---------------------------------------------------------------------------
void WifiPortal::_sendProgmem(WiFiClient& client, const char* progmemStr) {
  char buf[PORTAL_CHUNK + 1];
  size_t totalLen = strlen_P(progmemStr);
  size_t pos = 0;

  while (pos < totalLen) {
    size_t chunkLen = totalLen - pos;
    if (chunkLen > PORTAL_CHUNK) chunkLen = PORTAL_CHUNK;

    memcpy_P(buf, progmemStr + pos, chunkLen);
    buf[chunkLen] = '\0';
    client.print(buf);

    pos += chunkLen;
  }
}

// ---------------------------------------------------------------------------
// _handleSave — Procesa el formulario POST /save
// ---------------------------------------------------------------------------
void WifiPortal::_handleSave(WiFiClient& client, const String& body) {
  String ssidManual = _urlDecode(_extractField(body, "ssid"));
  String ssidScan   = _urlDecode(_extractField(body, "ssid_scan"));
  String password   = _urlDecode(_extractField(body, "password"));

  // El campo manual tiene prioridad sobre el select
  String ssid = ssidManual.length() > 0 ? ssidManual : ssidScan;
  ssid.trim();
  password.trim();

  Serial.print("[PORTAL] SSID recibido: '");
  Serial.print(ssid);
  Serial.println("'");

  if (ssid.length() == 0) {
    client.println("HTTP/1.1 400 Bad Request");
    client.println("Content-Type: text/html; charset=utf-8");
    client.println("Connection: close");
    client.println();
    client.println("<html><body><h2>Error: SSID vacio.</h2>"
                   "<a href='/'>Volver</a></body></html>");
    return;
  }

  // Respuesta de éxito antes del reset (el callback llama NVIC_SystemReset)
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: text/html; charset=utf-8");
  client.println("Connection: close");
  client.println();
  client.println("<html><head><meta charset='UTF-8'>"
                 "<style>body{font-family:sans-serif;background:#0f1117;color:#e4e6eb;"
                 "display:flex;justify-content:center;align-items:center;min-height:100vh}"
                 ".card{background:#1a1d27;padding:28px;border-radius:14px;text-align:center}"
                 "h2{color:#10b981}p{color:#8b8fa3;margin-top:8px}</style></head>"
                 "<body><div class='card'><h2>&#10003; Red guardada</h2>"
                 "<p>El dispositivo se reiniciara en 1 segundo...</p></div></body></html>");

  delay(800);

  if (_onSave != nullptr) {
    _onSave(ssid.c_str(), password.c_str());
  }
}

// ---------------------------------------------------------------------------
// _sendRedirect — Redirige al cliente a la raíz del portal
// ---------------------------------------------------------------------------
void WifiPortal::_sendRedirect(WiFiClient& client) {
  client.println("HTTP/1.1 302 Found");
  client.println("Location: /");
  client.println("Connection: close");
  client.println();
}

// ---------------------------------------------------------------------------
// _extractField — Extrae campo de un body URL-encoded
// ---------------------------------------------------------------------------
String WifiPortal::_extractField(const String& body, const String& key) {
  String search = key + "=";
  int startIdx  = body.indexOf(search);
  if (startIdx < 0) return "";

  startIdx += search.length();
  int endIdx = body.indexOf('&', startIdx);
  if (endIdx < 0) endIdx = body.length();

  return body.substring(startIdx, endIdx);
}

// ---------------------------------------------------------------------------
// _urlDecode — Decodifica URL encoding (%XX → char, '+' → espacio)
// ---------------------------------------------------------------------------
String WifiPortal::_urlDecode(const String& encoded) {
  String decoded = "";
  decoded.reserve(encoded.length());

  for (unsigned int i = 0; i < encoded.length(); i++) {
    char c = encoded[i];
    if (c == '+') {
      decoded += ' ';
    } else if (c == '%' && i + 2 < encoded.length()) {
      char h1 = encoded[i + 1];
      char h2 = encoded[i + 2];
      uint8_t hi = (h1 >= 'A') ? (h1 >= 'a' ? h1 - 'a' + 10 : h1 - 'A' + 10) : h1 - '0';
      uint8_t lo = (h2 >= 'A') ? (h2 >= 'a' ? h2 - 'a' + 10 : h2 - 'A' + 10) : h2 - '0';
      decoded += (char)((hi << 4) | lo);
      i += 2;
    } else {
      decoded += c;
    }
  }

  return decoded;
}
