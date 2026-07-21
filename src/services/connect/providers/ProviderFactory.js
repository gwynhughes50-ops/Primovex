import SimulatorProvider, { SIMULATOR_PROVIDER_ID } from "./SimulatorProvider";
import TuyaProvider, { TUYA_PROVIDER_ID } from "./TuyaProvider";

export const CONNECT_PROVIDER_IDS = {
  simulator: SIMULATOR_PROVIDER_ID,
  tuya: TUYA_PROVIDER_ID,
  esp32: "esp32",
  mqtt: "mqtt",
  homeAssistant: "home-assistant",
};

export const CONNECT_PROVIDERS = {
  [SIMULATOR_PROVIDER_ID]: SimulatorProvider,
  [TUYA_PROVIDER_ID]: TuyaProvider,
};

export const FUTURE_PROVIDERS = [
  {
    id: CONNECT_PROVIDER_IDS.esp32,
    label: "MedTrak Connect Node / ESP32",
    shortLabel: "ESP32",
    status: "planned",
    mode: "mqtt-or-https",
    description: "Owned hardware path using ESP32, DS18B20 probes and MedTrak firmware.",
    supports: ["temperature", "humidity", "battery", "signal", "ota"],
  },
  {
    id: CONNECT_PROVIDER_IDS.mqtt,
    label: "Generic MQTT",
    shortLabel: "MQTT",
    status: "planned",
    mode: "local-or-cloud",
    description: "Hardware-agnostic path for sensors publishing readings to an MQTT broker.",
    supports: ["temperature", "humidity", "events", "alerts"],
  },
  {
    id: CONNECT_PROVIDER_IDS.homeAssistant,
    label: "Home Assistant",
    shortLabel: "Home Assistant",
    status: "planned",
    mode: "local-hub",
    description: "Local hub integration for multiple smart-home device ecosystems.",
    supports: ["temperature", "humidity", "door", "leak", "power", "co2"],
  },
];

export function getProvider(providerId = SIMULATOR_PROVIDER_ID) {
  return CONNECT_PROVIDERS[providerId] || SimulatorProvider;
}

export function listProviders() {
  return [...Object.values(CONNECT_PROVIDERS), ...FUTURE_PROVIDERS];
}

export function getProviderSummary(providerId = SIMULATOR_PROVIDER_ID) {
  return listProviders().find((provider) => provider.id === providerId) || SimulatorProvider;
}
