const simulatorProvider = require("./simulatorProvider");
const tuyaProvider = require("./tuyaProvider");

const providers = {
  simulator: simulatorProvider,
  tuya: tuyaProvider,
};

function getProvider(providerId = "simulator") {
  return providers[providerId] || simulatorProvider;
}

function listProviders() {
  return Object.values(providers).map((provider) => ({ id: provider.id, label: provider.label }));
}

module.exports = { getProvider, listProviders };
