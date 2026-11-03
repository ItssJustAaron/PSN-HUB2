import { establishPrimitive } from "./webkit.js";
import { installWindowP } from "./utils/mem.js";

const output = document.getElementById("console");

function writeLog(message, type = "log", replace = false) {
  if (!output) return;
  let line = replace ? output.lastElementChild : null;
  if (!line) {
    line = document.createElement("div");
    output.appendChild(line);
  }
  let marker = "*";
  if (type === "error") marker = "-";
  if (type === "info" || type === "success") marker = "+";
  line.textContent = `[${marker}] ${message}`;
  output.scrollTop = output.scrollHeight;
}

function writeEvent(name, detail, type) {
  writeLog(
    detail == null || detail === "" ? name : `${name}: ${detail}`,
    type || (name === "Failed" ? "error" : "log")
  );
}

window.writeLog = writeLog;
window.jb = { mark: writeEvent };

// ELF Payload loader function
async function loadElfPayload(fileName) {
  // Safe Mode for non-PS5 browsers
  if (!window.isPS5) {
    writeLog(`[PREVIEW] Mock dispatching payload: ${fileName}`, "info");
    setTimeout(() => {
      writeLog(`[PREVIEW] ${fileName} dispatched successfully (Simulation Mode).`, "success");
    }, 700);
    return;
  }

  try {
    writeLog(`Fetching payload: ${fileName}...`, "info");

    // encodeURIComponent protects filenames containing '+' or special characters
    const cleanPath = `./payloads/${encodeURIComponent(fileName)}`;
    const response = await fetch(cleanPath);

    if (!response.ok) {
      throw new Error(`File ${fileName} not found on server (HTTP ${response.status})`);
    }

    const payloadBuffer = await response.arrayBuffer();
    writeLog(`Loaded ${fileName} (${payloadBuffer.byteLength} bytes). Dispatching to port 9021...`, "info");

    // Standard port 9021 injection
    if (typeof window.sendPayloadToPort === "function") {
      await window.sendPayloadToPort(payloadBuffer, 9021);
      writeLog(`${fileName} loaded and running!`, "success");
    } else {
      writeLog(`Port 9021 handler not detected. Ensure kernel exploit has finished.`, "error");
    }
  } catch (err) {
    writeLog(`Failed to load ${fileName}: ${err.message}`, "error");
  }
}

// Expose loader to HTML buttons
window.loadElfPayload = loadElfPayload;

async function getPrimitive() {
  writeLog("Starting WebKit exploit");
  const primitive = installWindowP(await establishPrimitive(writeEvent));
  if (!primitive || typeof primitive.read8 !== "function")
    throw new Error("Memory primitive unavailable");

  writeLog("ARW ready", "success");
  return primitive;
}

function getWebKitBase() {
  const ctor = globalThis.__ps5NativeCtor;
  if (typeof ctor !== "number" || typeof OFFSET_wk_host_constructor_candidates === "undefined")
    throw new Error("WebKit base inputs are unavailable");

  for (const offset of OFFSET_wk_host_constructor_candidates) {
    const base = ctor - offset;
    if (base >= 0x800000000 && base < 0x900000000 && base % 0x4000 === 0)
      return base;
  }

  throw new Error("WebKit base not found");
}

async function run() {
  // Stop early on non-PS5 browsers so the UI remains fully visible and active
  if (!window.isPS5) {
    writeLog("Non-PS5 environment detected (PC / Mobile).", "info");
    writeLog("Preview Mode active: Exploit primitives dormant.", "success");
    return;
  }

  const rejection = window.firmware && typeof window.firmware.rejection === "function"
    ? window.firmware.rejection()
    : null;

  if (rejection) {
    throw new Error(rejection);
  }

  writeLog("Credits: Sonic_Iso, Jordy, ntfargo, ufm42, Dr. Yenyen, TheFlow, SlidyBat, Flatz, cow, nhk, bollarz, Sleirsgoevy, EchoStretch, EarthOnion", "info");
  writeLog(`Agent: ${navigator.userAgent}`, "info");
  writeLog(`Firmware: ${window.fw_str || "Unknown"}`, "info");

  const primitive = await getPrimitive();
  writeLog(`WebKit base: 0x${getWebKitBase().toString(16)}`, "info");

  await import("./relapse_exploit.js");
  if (typeof main === "function") {
    await main(primitive);
  }
}

run().catch((error) => writeLog(error instanceof Error ? error.message : String(error), "error"));
