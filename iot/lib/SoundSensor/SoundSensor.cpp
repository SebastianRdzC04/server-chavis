// =============================================================================
// SoundSensor.cpp — Implementación de la lectura del sensor de sonido
//
// Algoritmo Welford online para calcular RMS en tiempo real:
//   Para cada muestra x_i:
//     delta  = x_i - mean
//     n++
//     mean  += delta / n
//     delta2 = x_i - mean
//     M2    += delta * delta2
//   Al final: varianza = M2 / n  →  RMS = sqrt(M2 / n)
//
// Se usa double internamente para acumular M2 sin pérdida de precisión.
// La conversión a float ocurre solo al calcular el resultado final.
//
// Filtro EMA (suavizado exponencial):
//   smooth = alpha * nuevo + (1 - alpha) * smooth_anterior
//   Con alpha = 0.2, responde rápido pero filtra ruido puntual.
// =============================================================================

#include "SoundSensor.h"
#include <math.h>  // sqrt, log10, isnan

// ---------------------------------------------------------------------------
// begin — Configura el ADC a 12 bits de resolución
// ---------------------------------------------------------------------------
void SoundSensor::begin() {
  analogReadResolution(SOUND_ADC_BITS);
  Serial.println("[SOUND] Sensor de sonido inicializado (ADC 12-bit, pin A0).");
}

// ---------------------------------------------------------------------------
// read — Muestrea durante SOUND_WINDOW_MS y retorna la muestra procesada
// ---------------------------------------------------------------------------
SoundSample SoundSensor::read() {
  SoundSample result = { 0.0f, 0.0f, 0.0f, false };

  // -------------------------------------------------------------------------
  // Paso 1: Welford online RMS sobre la ventana de tiempo
  // -------------------------------------------------------------------------
  unsigned long t0 = millis();

  double n    = 0.0;
  double mean = 0.0;
  double M2   = 0.0;

  while (millis() - t0 < SOUND_WINDOW_MS) {
    int val = analogRead(SOUND_PIN);

    double delta  = (double)val - mean;
    n++;
    mean         += delta / n;
    double delta2 = (double)val - mean;
    M2           += delta * delta2;
  }

  if (n < 1.0) {
    // No se tomó ninguna muestra (ventana demasiado corta)
    return result;
  }

  // -------------------------------------------------------------------------
  // Paso 2: RMS → Vrms → dB
  // -------------------------------------------------------------------------
  double rms  = sqrt(M2 / n);
  float  Vrms = (float)(rms * (SOUND_VREF / SOUND_ADC_MAX));

  if (Vrms <= 0.0f || isnan(Vrms)) {
    return result;
  }

  float db_rel = 20.0f * log10(Vrms / SOUND_VRMS_CAL);
  float db_spl = SOUND_DB_REF_CAL + db_rel;

  if (isnan(db_rel) || isnan(db_spl)) {
    return result;
  }

  // -------------------------------------------------------------------------
  // Paso 3: Suavizado EMA
  // El primer ciclo inicializa el filtro directamente con el valor real
  // para evitar el transitorio desde 0.
  // -------------------------------------------------------------------------
  if (!_initialized) {
    _smooth_vrms   = Vrms;
    _smooth_db_rel = db_rel;
    _smooth_db_spl = db_spl;
    _initialized   = true;
  } else {
    _smooth_vrms   = SOUND_EMA_ALPHA * Vrms   + (1.0f - SOUND_EMA_ALPHA) * _smooth_vrms;
    _smooth_db_rel = SOUND_EMA_ALPHA * db_rel + (1.0f - SOUND_EMA_ALPHA) * _smooth_db_rel;
    _smooth_db_spl = SOUND_EMA_ALPHA * db_spl + (1.0f - SOUND_EMA_ALPHA) * _smooth_db_spl;
  }

  result.vrms   = _smooth_vrms;
  result.db_rel = _smooth_db_rel;
  result.db_spl = _smooth_db_spl;
  result.ready  = true;

  return result;
}
