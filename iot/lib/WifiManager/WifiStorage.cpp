// =============================================================================
// WifiStorage.cpp — Implementación de la capa de persistencia Flash (SAMD21)
//
// FlashStorage_SAMD provee un objeto FlashStorage<T> que actúa como un
// almacenamiento tipado no volátil. Internamente usa la Flash NVM del SAMD21.
//
// API de FlashStorage_SAMD:
//   FlashStorage<DeviceConfig> myStorage;
//   DeviceConfig data = myStorage.read();   // leer
//   myStorage.write(data);                  // escribir
// =============================================================================

#include "WifiStorage.h"
#include <FlashStorage_SAMD.h>  // Solo aquí: evita múltiples definiciones al enlazar
#include <string.h>  // memset, strncpy

// ---------------------------------------------------------------------------
// Objeto de almacenamiento Flash para DeviceConfig.
// Se declara aquí (una sola vez) para evitar conflictos de enlazado.
// FlashStorage_SAMD reserva automáticamente espacio en Flash para el tipo T.
// ---------------------------------------------------------------------------
FlashStorage(wifiConfigStorage, DeviceConfig);

// ---------------------------------------------------------------------------
// load — Lee la configuración desde Flash
// ---------------------------------------------------------------------------
void WifiStorage::load(DeviceConfig& config) {
  // FlashStorage_SAMD::read() toma una referencia, no retorna por valor
  wifiConfigStorage.read(config);

  // Si el magic no coincide, la Flash no tiene datos válidos del sistema.
  // Inicializamos el struct a un estado limpio sin escribir nada.
  if (!isValid(config)) {
    Serial.println("[STORAGE] Flash sin datos validos. Inicializando config limpia.");
    memset(&config, 0, sizeof(DeviceConfig));
    config.magic        = WIFI_MAGIC;
    config.networkCount = 0;
    config.newestIndex  = 0;
  }
}

// ---------------------------------------------------------------------------
// save — Escribe la configuración completa en Flash
// FlashStorage_SAMD::write() toma T& (no const T&), necesitamos copia mutable
// ---------------------------------------------------------------------------
void WifiStorage::save(const DeviceConfig& config) {
  DeviceConfig mutable_config = config;  // copia mutable requerida por la librería
  wifiConfigStorage.write(mutable_config);
  Serial.print("[STORAGE] Config guardada en Flash. Redes almacenadas: ");
  Serial.println(config.networkCount);
}

// ---------------------------------------------------------------------------
// reset — Borra la configuración y escribe el estado limpio en Flash
// ---------------------------------------------------------------------------
void WifiStorage::reset(DeviceConfig& config) {
  memset(&config, 0, sizeof(DeviceConfig));
  config.magic        = WIFI_MAGIC;
  config.networkCount = 0;
  config.newestIndex  = 0;
  save(config);
  Serial.println("[STORAGE] Flash reseteada.");
}

// ---------------------------------------------------------------------------
// isValid — Verifica si la Flash contiene datos del sistema
// ---------------------------------------------------------------------------
bool WifiStorage::isValid(const DeviceConfig& config) {
  return config.magic == WIFI_MAGIC;
}

// ---------------------------------------------------------------------------
// addNetwork — Agrega red usando cola circular FIFO
//
// Lógica de la cola circular:
//
//   Estado inicial (networkCount=2, newestIndex=1):
//     slot[0] = red A   <- más antigua
//     slot[1] = red B   <- más nueva   (newestIndex = 1)
//
//   Agregar red C (hay espacio → slot[2]):
//     slot[2] = red C
//     networkCount = 3, newestIndex = 2
//
//   Agregar red D (lleno → sobreescribe la más antigua):
//     índice a sobreescribir = (newestIndex + 1) % MAX = (2+1) % 3 = 0
//     slot[0] = red D   <- sobreescribe red A (la más antigua)
//     newestIndex = 0, networkCount permanece en 3
//
//   Orden de conexión: newest → newest-1 → newest-2
// ---------------------------------------------------------------------------
void WifiStorage::addNetwork(DeviceConfig& config, const char* ssid, const char* pass) {
  uint8_t targetSlot;

  if (config.networkCount < WIFI_MAX_NETWORKS) {
    // Hay espacio: usamos el siguiente slot libre
    targetSlot = config.networkCount;
    config.networkCount++;
  } else {
    // Cola llena: sobreescribimos el slot más antiguo (el siguiente al newest)
    targetSlot = (config.newestIndex + 1) % WIFI_MAX_NETWORKS;
    Serial.print("[STORAGE] Cola llena. Sobreescribiendo slot ");
    Serial.println(targetSlot);
  }

  // Copiar credenciales con protección de buffer
  memset(&config.networks[targetSlot], 0, sizeof(WifiNetwork));
  strncpy(config.networks[targetSlot].ssid,
          ssid,
          sizeof(config.networks[targetSlot].ssid) - 1);
  strncpy(config.networks[targetSlot].password,
          pass,
          sizeof(config.networks[targetSlot].password) - 1);

  // Actualizar puntero al más nuevo
  config.newestIndex = targetSlot;

  Serial.print("[STORAGE] Red agregada en slot ");
  Serial.print(targetSlot);
  Serial.print(": ");
  Serial.println(ssid);
}

// ---------------------------------------------------------------------------
// getNetworkIndex — Índice real del slot según orden de prioridad
//   orden 0 = más reciente (mayor prioridad de conexión)
//   orden 1 = anterior, etc.
//   Retorna -1 si orden >= networkCount
// ---------------------------------------------------------------------------
int8_t WifiStorage::getNetworkIndex(const DeviceConfig& config, uint8_t orden) {
  if (orden >= config.networkCount) {
    return -1;  // No existe esa posición
  }

  // Navegar hacia atrás desde newestIndex en módulo WIFI_MAX_NETWORKS
  // Formula: (newestIndex - orden + MAX) % MAX
  int8_t idx = ((int8_t)config.newestIndex - (int8_t)orden + WIFI_MAX_NETWORKS)
               % WIFI_MAX_NETWORKS;
  return idx;
}
