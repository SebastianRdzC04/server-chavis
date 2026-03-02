#pragma once

// =============================================================================
// SoundSensor.h — Lectura del sensor de sonido analógico (SAMD21 ADC 12-bit)
//
// Responsabilidad única: muestrear el micrófono, calcular RMS por el método
// de Welford online, aplicar suavizado EMA y retornar Vrms + dB_rel + dB_SPL.
//
// Uso:
//   SoundSensor sensor;
//   sensor.begin();            // en setup()
//   SoundSample s = sensor.read();  // en loop() — bloquea ~50ms
//   if (s.ready) { /* usar s.vrms, s.db_rel, s.db_spl */ }
//
// Notas de calibración (copiadas del código de referencia):
//   VRMS_CAL  = 0.0100  V  — Vrms de referencia para 0 dB_rel
//   DB_REF_CAL = 94.0   dB — dB SPL equivalente a la referencia (calibración)
//   La fórmula dB_SPL = DB_REF_CAL + 20*log10(Vrms / VRMS_CAL) aproxima el
//   nivel SPL usando el micrófono sin cámara anecoica.
// =============================================================================

#include <Arduino.h>

// ---------------------------------------------------------------------------
// Constantes de hardware
// ---------------------------------------------------------------------------

/** Pin analógico del micrófono. */
#define SOUND_PIN           A0

/** Tensión de referencia del ADC (SAMD21 opera a 3.3 V). */
#define SOUND_VREF          3.3f

/** Resolución ADC en bits. MKR WiFi 1010 soporta hasta 12 bits. */
#define SOUND_ADC_BITS      12

/** Valor máximo del ADC (2^12 − 1). */
#define SOUND_ADC_MAX       4095

/** Ventana de muestreo Welford por cada llamada a read() en ms. */
#define SOUND_WINDOW_MS     50UL

// ---------------------------------------------------------------------------
// Constantes de calibración
// ---------------------------------------------------------------------------

/** Vrms de referencia: corresponde al nivel de 0 dB relativo. */
#define SOUND_VRMS_CAL      0.0100f

/** Nivel de presión sonora (SPL) correspondiente a VRMS_CAL. */
#define SOUND_DB_REF_CAL    94.0f

/** Factor alfa del filtro EMA (suavizado exponencial). 0 < alpha <= 1. */
#define SOUND_EMA_ALPHA     0.2f

// ---------------------------------------------------------------------------
// Resultado de una muestra
// ---------------------------------------------------------------------------

/**
 * SoundSample — Datos calculados por una ventana de muestreo.
 *
 * ready == false indica que la muestra no es válida (n=0, Vrms=0 o NaN).
 * En ese caso ignorar vrms, db_rel, db_spl.
 */
struct SoundSample {
  float vrms;    // Tensión RMS en voltios
  float db_rel;  // Nivel relativo en dB (referenciado a VRMS_CAL)
  float db_spl;  // Nivel SPL estimado en dB (calibrado con DB_REF_CAL)
  bool  ready;   // true si la muestra es válida
};

// ---------------------------------------------------------------------------
// Clase SoundSensor
// ---------------------------------------------------------------------------

class SoundSensor {
public:
  // -------------------------------------------------------------------------
  // Inicializa el ADC con resolución de 12 bits.
  // Llamar una sola vez en setup().
  // -------------------------------------------------------------------------
  void begin();

  // -------------------------------------------------------------------------
  // Muestrea el micrófono durante SOUND_WINDOW_MS usando Welford online,
  // aplica suavizado EMA y retorna el resultado.
  //
  // Bloquea aproximadamente SOUND_WINDOW_MS milisegundos.
  // Llamar en loop() — WifiManager.loop() debe llamarse antes.
  // -------------------------------------------------------------------------
  SoundSample read();

private:
  // Estado del filtro EMA (persiste entre llamadas a read())
  float _smooth_vrms   = 0.0f;
  float _smooth_db_rel = 0.0f;
  float _smooth_db_spl = 0.0f;

  // true después del primer read() válido (para no arrancar EMA en 0)
  bool  _initialized = false;
};
