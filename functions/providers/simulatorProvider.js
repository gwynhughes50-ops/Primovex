const now = () => new Date();

const SIMULATOR_DEVICES = [
  {
    id: "sim-vaccine-fridge-1",
    provider: "simulator",
    providerLabel: "Simulator",
    name: "Vaccine Fridge 1",
    type: "fridge",
    site: "Main Branch",
    room: "Treatment Room 1",
    equipment: "Cold chain storage",
    unit: "°C",
    min: 2,
    max: 8,
    battery: 98,
    signal: 92,
    firmware: "cloud-sim-1.0.0",
  },
  {
    id: "sim-minus-40-freezer",
    provider: "simulator",
    providerLabel: "Simulator",
    name: "-40°C Freezer",
    type: "freezer",
    site: "Main Branch",
    room: "Cold Store",
    equipment: "Ultra-low temperature freezer",
    unit: "°C",
    min: -45,
    max: -35,
    battery: 100,
    signal: 86,
    firmware: "cloud-sim-1.0.0",
  },
  {
    id: "sim-treatment-room-sensor",
    provider: "simulator",
    providerLabel: "Simulator",
    name: "Treatment Room Sensor",
    type: "environment",
    site: "Main Branch",
    room: "Treatment Room 2",
    equipment: "Room environment",
    unit: "°C",
    min: 16,
    max: 26,
    battery: 32,
    signal: 72,
    firmware: "cloud-sim-1.0.0",
  },
];

function seededValue(device) {
  const minute = Math.floor(Date.now() / 60000);
  const wave = Math.sin((minute + device.id.length) / 5) * 0.3;
  if (device.type === "freezer") return Number((-40.2 + wave).toFixed(1));
  if (device.type === "environment") return Number((21.4 + wave).toFixed(1));
  return Number((4.2 + wave).toFixed(1));
}

module.exports = {
  id: "simulator",
  label: "Simulator",
  async getHealth() {
    return {
      provider: "simulator",
      status: "online",
      healthScore: 100,
      message: "Simulator provider ready.",
      checkedAt: now(),
    };
  },
  async getDevices() {
    return SIMULATOR_DEVICES.map((device) => ({
      ...device,
      currentValue: seededValue(device),
      humidity: device.type === "environment" ? 54 : 42,
      status: "online",
      lastSeen: now(),
      updatedAt: now(),
    }));
  },
};
