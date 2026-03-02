#pragma once

// =============================================================================
// WifiStorage.h — Capa de persistencia en Flash (emulación EEPROM para SAMD21)
//
// El SAMD21 (MKR WiFi 1010) no tiene EEPROM física. FlashStorage_SAMD emula
// EEPROM usando la memoria Flash NVM del microcontrolador.
//
// Responsabilidad única: leer y escribir DeviceConfig en Flash.
// No conoce WiFi, portales ni lógica de conexión.
//
// Cola circular FIFO para redes:
//   - Guarda hasta WIFI_MAX_NETWORKS redes.
//   - Al superar el límite, sobreescribe la red más antigua automáticamente.
//   - newestIndex apunta siempre al slot más reciente.
//
// NOTA: FlashStorage_SAMD.h se incluye SOLO en WifiStorage.cpp para evitar
// múltiples definiciones del objeto de almacenamiento al enlazar.
// =============================================================================

#include "WifiConfig.h"

class WifiStorage {
public:
  // ---------------------------------------------------------------------------
  // Carga la configuración desde EEPROM en el struct proporcionado.
  // Si la EEPROM no tiene datos válidos (magic incorrecto), inicializa
  // el struct con valores por defecto (networkCount = 0).
  // ---------------------------------------------------------------------------
  static void load(DeviceConfig& config);

  // ---------------------------------------------------------------------------
  // Serializa y escribe el struct completo en EEPROM.
  // Solo debe llamarse cuando haya un cambio real en la configuración.
  // Usa EEPROM.put() para escribir solo los bytes que cambiaron.
  // ---------------------------------------------------------------------------
  static void save(const DeviceConfig& config);

  // ---------------------------------------------------------------------------
  // Inicializa el struct con valores por defecto y guarda en EEPROM.
  // Útil para borrar toda la configuración almacenada.
  // ---------------------------------------------------------------------------
  static void reset(DeviceConfig& config);

  // ---------------------------------------------------------------------------
  // Verifica si la configuración tiene datos válidos del sistema.
  // Retorna true si config.magic == WIFI_MAGIC.
  // ---------------------------------------------------------------------------
  static bool isValid(const DeviceConfig& config);

  // ---------------------------------------------------------------------------
  // Agrega una red WiFi a la cola circular FIFO.
  //
  // Comportamiento:
  //   - Si networkCount < WIFI_MAX_NETWORKS: ocupa el siguiente slot libre.
  //   - Si networkCount == WIFI_MAX_NETWORKS: sobreescribe la red más antigua
  //     (la que está en el slot (newestIndex + 1) % WIFI_MAX_NETWORKS).
  //
  // Tras agregar, actualiza newestIndex y networkCount. NO guarda en EEPROM
  // automáticamente — el caller debe llamar save() después si lo desea.
  // ---------------------------------------------------------------------------
  static void addNetwork(DeviceConfig& config, const char* ssid, const char* pass);

  // ---------------------------------------------------------------------------
  // Devuelve el índice del slot a intentar en el orden de conexión.
  // orden 0 = más reciente, orden 1 = anterior, etc.
  // Retorna -1 si orden >= networkCount.
  // ---------------------------------------------------------------------------
  static int8_t getNetworkIndex(const DeviceConfig& config, uint8_t orden);

private:
  // Constructor privado: esta clase es 100% estática, no se instancia.
  WifiStorage() = delete;
};
