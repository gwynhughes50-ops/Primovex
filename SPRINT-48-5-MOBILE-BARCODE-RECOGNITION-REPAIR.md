# Sprint 48.5 – Mobile Barcode Recognition Repair

Version 0.15.9

- Retains the confirmed working in-panel Android camera introduced in v0.15.8.
- Enables ZXing TRY_HARDER and inverted-barcode recognition.
- Explicitly enables common healthcare and inventory formats: EAN-13/8, UPC-A/E, Code 128/39/93, ITF, Codabar, GS1 DataBar, Data Matrix, QR, PDF417 and Aztec.
- Requests a 1920×1080 rear-camera stream with continuous focus where supported.
- Gives live guidance when a barcode shape is detected but checksum or formatting is not yet clear.
- Preserves manual entry, camera cleanup, masked PIN, Orb native voice and all reconciliation behaviour.
