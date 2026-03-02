#pragma once

// =============================================================================
// WifiConfig.h — Tipos, estructuras y constantes del sistema WiFi
// No contiene lógica. Solo definiciones compartidas entre módulos.
// =============================================================================

#include <Arduino.h>

// ---------------------------------------------------------------------------
// Constantes de configuración
// ---------------------------------------------------------------------------

/** Número máximo de redes WiFi guardadas (cola circular FIFO). */
#define WIFI_MAX_NETWORKS       3

/** Magic number para validar que la EEPROM contiene datos del sistema. */
#define WIFI_MAGIC              0xBEEF

/** Dirección base en EEPROM donde se serializa DeviceConfig. */
#define WIFI_EEPROM_ADDR        0

/** SSID del Access Point que se levanta en modo configuración. */
#define WIFI_AP_SSID            "Arduino-Setup"

/** Puerto del servidor HTTP del portal de configuración. */
#define WIFI_PORTAL_PORT        80

/** Tiempo máximo de espera por red al intentar conectarse (ms). */
#define WIFI_CONNECT_TIMEOUT_MS 10000UL

/** Intervalo de polling durante el intento de conexión (ms). */
#define WIFI_CONNECT_POLL_MS    500UL

/** Tiempo máximo esperando cliente HTTP antes de timeout (ms). */
#define WIFI_CLIENT_TIMEOUT_MS  2000UL

// ---------------------------------------------------------------------------
// Estructuras de datos
// ---------------------------------------------------------------------------

/**
 * WifiNetwork — Credenciales de una red WiFi.
 * Tamaño: 32 + 64 = 96 bytes por entrada.
 */
struct WifiNetwork {
  char ssid[32];       // Nombre de la red (null-terminated)
  char password[64];   // Contraseña (null-terminated, vacío = red abierta)
};

/**
 * DeviceConfig — Configuración completa persistida en EEPROM.
 *
 * Cola circular FIFO implementada con newestIndex:
 *   - Al agregar una red cuando networkCount == WIFI_MAX_NETWORKS,
 *     se sobreescribe el slot más antiguo automáticamente.
 *   - Conexión se intenta desde el más nuevo al más antiguo.
 *
 * Tamaño total: 2 + 1 + 1 + 3*96 = 292 bytes en EEPROM.
 */
struct DeviceConfig {
  uint16_t    magic;                          // Debe ser WIFI_MAGIC para datos válidos
  uint8_t     networkCount;                   // Redes almacenadas (0..WIFI_MAX_NETWORKS)
  uint8_t     newestIndex;                    // Índice del slot más reciente (cola circular)
  WifiNetwork networks[WIFI_MAX_NETWORKS];    // Slots de redes (acceso circular)
};

// ---------------------------------------------------------------------------
// Estados del sistema WiFi
// ---------------------------------------------------------------------------

/**
 * WifiState — Estado interno del WifiManager.
 * Determina qué rama ejecuta loop().
 */
enum class WifiState : uint8_t {
  BOOTING,        // Arranque inicial, aún no se intentó nada
  CONNECTING,     // Intentando conectarse a redes guardadas
  CONNECTED,      // Conectado: modo normal, lógica principal puede correr
  CONFIG_PORTAL   // Sin internet: AP levantado, portal web activo
};
