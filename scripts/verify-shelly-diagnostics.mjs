import assert from "node:assert/strict";
import { connectionLines, describeShellyError, recordTransition, rssiLabel, rssiToPercent, summariseThermometer, unmatchedWakeHint } from "../src/services/connect/shellyDiagnostics.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const now = Date.UTC(2026, 9, 12, 12, 0);

t("a network error becomes a reason and something to try", () => {
  assert.match(describeShellyError("error sending request for url (http://192.168.1.50/rpc/Shelly.GetStatus)", { ip: "192.168.1.50" }), /Could not reach at 192\.168\.1\.50/);
  assert.match(describeShellyError("operation timed out", { ip: "10.0.0.5" }), /No answer at 10\.0\.0\.5.*switched off.*address has changed/);
  assert.match(describeShellyError("operation timed out", { ip: "10.0.0.5", wakeOnly: true }), /asleep between reports/);
  assert.match(describeShellyError("Device responded with status 404 Not Found", { ip: "10.0.0.5" }), /not a Shelly/);
  assert.match(describeShellyError(new Error("Device response did not include a temperature reading.")), /sent no temperature/);
  assert.equal(describeShellyError("something odd"), "something odd");
});

t("the story for one thermometer: last answer, last failure, and the wake for a battery sensor", () => {
  const mains = summariseThermometer({ lastOkAt: now - 2 * 3600000, lastAttemptAt: now - 3 * 60000, lastError: "No answer" }, { ip: "1.1.1.1" }, now);
  assert.deepEqual(mains.map((l) => l.tone), ["ok", "bad"]);
  assert.match(mains[0].text, /2 h ago/);
  assert.match(mains[1].text, /3 min ago: No answer/);
  const recovered = summariseThermometer({ lastOkAt: now - 60000, lastAttemptAt: now - 120000, lastError: "old" }, {}, now);
  assert.deepEqual(recovered.map((l) => l.tone), ["ok"], "an old failure is not shown once it has answered since");
  const battery = summariseThermometer({}, { wakeOnly: true }, now);
  assert.equal(battery[0].tone, "warn");
  assert.match(battery[0].text, /not heard it wake/);
  assert.match(summariseThermometer({ lastWakeAt: now - 600000 }, { wakeOnly: true }, now)[0].text, /woke and reported 10 min ago/);
  assert.match(summariseThermometer({}, {}, now)[0].text, /Not tried yet/);
});

t("a wake from an unknown address is called out", () => {
  const configs = [{ ip: "192.168.1.50" }];
  assert.equal(unmatchedWakeHint([{ ip: "192.168.1.50" }], configs), "");
  assert.match(unmatchedWakeHint([{ ip: "192.168.1.77" }, { ip: "192.168.1.77" }], configs), /192\.168\.1\.77 woke.*address has changed/);
});

t("signal strength in words and a percentage, and a weak one says what to do", () => {
  assert.equal(rssiToPercent(-50), 100);
  assert.equal(rssiToPercent(-75), 50);
  assert.equal(rssiToPercent(-120), 0);
  assert.equal(rssiToPercent(undefined), null);
  assert.equal(rssiLabel(-55), "-55 dBm, good");
  assert.equal(rssiLabel(-78), "-78 dBm, weak");
  const weak = connectionLines({ lastRssi: -78 }, [], now);
  assert.equal(weak[0].tone, "warn");
  assert.match(weak[0].text, /closer to a router/);
  assert.equal(connectionLines({ lastRssi: -52 }, [], now)[0].tone, "ok");
});

t("a restart and the drops in the last day and week are reported", () => {
  assert.match(connectionLines({ lastUptimeSec: 600 }, [], now)[0].text, /restarted 10 min before/);
  assert.equal(connectionLines({ lastUptimeSec: 86400 }, [], now).length, 0);
  let log = [];
  log = recordTransition(log, true, now - 3 * 86400000);
  log = recordTransition(log, false, now - 3 * 86400000 + 1000);
  log = recordTransition(log, true, now - 5 * 3600000);
  log = recordTransition(log, false, now - 2 * 3600000);
  log = recordTransition(log, false, now - 3600000);
  assert.equal(log.length, 4, "a second 'down' in a row is not another drop");
  assert.match(connectionLines({}, log, now)[0].text, /1 time in the last 24 hours \(2 in the last 7 days\)/);
  assert.equal(recordTransition([], false, now).length, 1);
});

console.log(`\n${n} passed`);
