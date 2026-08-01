# Primovex v0.15.34 - ClinFlow Structured Vital Signs

## Added

- Structured blood-pressure extraction with separate systolic and diastolic values.
- Governed SNOMED CT candidate concepts for blood pressure, systolic blood pressure and diastolic blood pressure.
- Structured candidates for heart rate, respiratory rate, peripheral oxygen saturation and body temperature.
- UCUM units for each structured observation.
- Structured vital-sign review in ClinFlow and the Docman companion summary PDF.

## Clinical safety

- Concepts were verified active against the SNOMED CT International Edition dated 1 July 2026.
- They remain candidates until validated against the current UK Edition and accepted by a trained clinician.
- Primovex does not automatically accept, file or transmit codes.
- NEWS2 and medicines retain their separate governed review pathways.

## Verification

- The five-document governed analysis test covers two blood-pressure readings and the emergency vital-sign set.
- Production web and Windows desktop builds must pass before release.
