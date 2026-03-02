#pragma once

// =============================================================================
// PortalHtml.h — Página HTML del portal de configuración WiFi en PROGMEM
//
// El HTML está dividido en 3 partes para permitir inserción de valores
// dinámicos sin búsqueda de placeholders en runtime:
//
//   PORTAL_HTML_PART1  — hasta donde va el valor de redes guardadas
//   (insertar: número de redes guardadas, ej. "2")
//   PORTAL_HTML_PART2  — desde después del contador hasta donde van los <option>
//   (insertar: string con <option> de redes escaneadas)
//   PORTAL_HTML_PART3  — resto del HTML hasta el final
//
// Al almacenar en PROGMEM el string reside en Flash (256KB) y no consume RAM.
// Se copia a RAM en bloques de PORTAL_CHUNK bytes al momento de servir.
//
// En ARM Cortex-M0+ (SAMD21) PROGMEM está en el framework Arduino SAMD.
// NO usar avr/pgmspace.h (exclusivo de AVR/ATmega).
// =============================================================================

#include <Arduino.h>

/** Tamaño del bloque de transferencia Flash → TCP (bytes). */
#define PORTAL_CHUNK 128

// ---------------------------------------------------------------------------
// Parte 1: desde el inicio del HTML hasta justo antes del número de redes
// guardadas. Termina en: ...Redes guardadas:
// ---------------------------------------------------------------------------
const char PORTAL_HTML_PART1[] PROGMEM = R"HTML(<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Arduino Setup</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
     background:#0f1117;color:#e4e6eb;min-height:100vh;
     display:flex;justify-content:center;align-items:center;padding:16px}
.card{background:#1a1d27;border-radius:14px;padding:28px;width:100%;max-width:380px;
      border:1px solid #2a2d3a}
h2{font-size:1.25rem;font-weight:700;margin-bottom:4px;color:#3b82f6}
.sub{font-size:.8rem;color:#8b8fa3;margin-bottom:20px}
.badge{display:inline-block;background:#2a2d3a;border-radius:20px;
       padding:2px 10px;font-size:.75rem;color:#8b8fa3;margin-bottom:20px}
label{display:block;font-size:.8rem;color:#8b8fa3;margin-bottom:4px;margin-top:14px}
select,input[type=text],input[type=password]{
  width:100%;padding:9px 12px;border-radius:8px;
  border:1px solid #2a2d3a;background:#0f1117;
  color:#e4e6eb;font-size:.9rem;outline:none;transition:border .2s}
select:focus,input:focus{border-color:#3b82f6}
.divider{text-align:center;color:#8b8fa3;font-size:.75rem;margin:10px 0}
button{width:100%;margin-top:18px;padding:11px;border:none;border-radius:8px;
       background:#3b82f6;color:#fff;font-size:.95rem;font-weight:600;
       cursor:pointer;transition:background .2s}
button:hover{background:#2563eb}
button:active{background:#1d4ed8}
.notice{margin-top:14px;font-size:.75rem;color:#8b8fa3;text-align:center}
#toast{display:none;margin-top:14px;padding:10px;border-radius:8px;
       background:#10b981;color:#fff;text-align:center;font-size:.85rem}
</style>
</head>
<body>
<div class="card">
  <h2>Arduino Setup</h2>
  <p class="sub">Configura la red WiFi del dispositivo</p>
  <span class="badge">Redes guardadas: )HTML";

// ---------------------------------------------------------------------------
// Parte 2: desde después del número de redes hasta justo antes de los <option>
// Empieza en: " / 3" (cierra el badge) y termina antes de los <option>
// ---------------------------------------------------------------------------
const char PORTAL_HTML_PART2[] PROGMEM = R"HTML( / 3</span>

  <form method="POST" action="/save" onsubmit="return validateForm()">

    <label>Redes disponibles (escaneo en vivo)</label>
    <select name="ssid_scan" id="ssidScan" onchange="onScanSelect()">
      <option value="">-- Selecciona una red --</option>
      )HTML";

// ---------------------------------------------------------------------------
// Parte 3: desde después de los <option> hasta el final del HTML
// ---------------------------------------------------------------------------
const char PORTAL_HTML_PART3[] PROGMEM = R"HTML(
    </select>

    <div class="divider">&#9135;&#9135; o escribe manualmente &#9135;&#9135;</div>

    <label>SSID (nombre de red)</label>
    <input type="text" name="ssid" id="ssidInput"
           placeholder="Nombre de la red WiFi" autocomplete="off">

    <label>Contrase&#241;a</label>
    <input type="password" name="password" id="passInput"
           placeholder="Contrase&#241;a (dejar vac&#237;o si es abierta)">

    <button type="submit">Guardar y Reiniciar</button>
  </form>

  <p class="notice">
    El dispositivo se reiniciar&#225; autom&#225;ticamente.<br>
    Si ya hay 3 redes guardadas, la m&#225;s antigua ser&#225; reemplazada.
  </p>
  <div id="toast">&#10003; Red guardada. Reiniciando...</div>
</div>
<script>
function onScanSelect(){
  var sel=document.getElementById('ssidScan');
  var inp=document.getElementById('ssidInput');
  if(sel.value!=='') inp.value=sel.value;
}
function validateForm(){
  var ssid=document.getElementById('ssidInput').value.trim();
  if(ssid===''){
    alert('Escribe o selecciona un SSID.');
    return false;
  }
  document.getElementById('toast').style.display='block';
  return true;
}
</script>
</body>
</html>
)HTML";
