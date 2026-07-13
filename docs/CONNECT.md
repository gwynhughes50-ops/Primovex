# MedTrak Connect

MedTrak Connect is the connected-device layer of MedTrak+.

It allows the platform to receive live readings from smart practice hardware such as Wi-Fi thermometers, fridge sensors, room sensors and future smart cabinets.

## Sprint 20 scope

Sprint 20 introduces the first version of MedTrak Connect using simulated Wi-Fi device readings.

The simulation allows the product workflow to be designed before committing to a specific hardware vendor.

## Initial device types

- Vaccine fridge thermometer
- Drug fridge thermometer
- Room environmental sensor

## Device data model

Connected devices are expected to write into the `connected_devices` collection.

Suggested fields:

```text
id
name
type
site
room
status
currentValue
unit
min
max
battery
signal
lastSeen
provider
```

## Design principle

Capture data once, use it everywhere.

A fridge reading should not only appear on the Connect screen. It should also feed:

- Operations Centre
- Practice Pulse
- Cold-chain compliance
- MedAI Daily Brief
- Audit history
- Future management reporting

## Future hardware integration

Future integrations should be added behind the Connect service layer so the user interface does not depend on a specific device provider.
