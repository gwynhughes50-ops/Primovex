const SYNTHETIC_DOCUMENT_PACK = Object.freeze({
  d5730aa7660a4bfee9d1a334614062760ae0329a4666e0e0b1ee71c043c98ab3: {
    id: "respiratory-clinic-letter",
    title: "Degraded respiratory clinic letter",
    expected: [
      ["Patient", "Alex Example"],
      ["Clinic", "Respiratory Medicine"],
      ["Oxygen saturation", "97%"],
      ["Follow-up", "8 weeks"],
      ["Medication", "salbutamol 100 micrograms"],
    ],
  },
  "91b350dbd44ba954d0354346046b52668d15a8b5802ba4271b14c162b9c5e2a5": {
    id: "faxed-discharge-summary",
    title: "Faxed two-page discharge summary",
    expected: [
      ["Patient", "Morgan Sample"],
      ["Diagnosis", "community-acquired pneumonia"],
      ["Outstanding result", "sputum culture"],
      ["Medication", "ramipril 5 mg"],
      ["Restart date", "02/08/2026"],
    ],
  },
  "905873ce6bb7cfc73a83b752875cbea7bbadec7c01ebee4b24066229ace560e1": {
    id: "handwritten-ward-review",
    title: "Handwritten ward review note",
    expected: [
      ["Patient", "Casey Fiction"],
      ["Oxygen saturation", "94% RA"],
      ["Temperature", "37.4"],
      ["Escalation threshold", "below 92%"],
      ["Blood tests", "U&E"],
      ["Inflammatory marker", "CRP"],
    ],
  },
  "4f5d831ebdeba473625316793045f57d8e62cf94096c25adc1497a38cdd77656": {
    id: "annotated-cardiology-letter",
    title: "Annotated two-page cardiology letter",
    expected: [
      ["Patient", "Taylor Testpatient"],
      ["Ejection fraction", "60%"],
      ["Medication", "bisoprolol 2.5 mg once daily"],
      ["Ventricular ectopics", "312"],
      ["Follow-up", "4 months"],
    ],
  },
  be3593b6211136a2f767b37491c6c9083a7402266f4269c5289276f9824ec88f: {
    id: "emergency-handover-form",
    title: "Dense emergency handover form",
    expected: [
      ["Patient", "Jordan Example"],
      ["NEWS2", "3"],
      ["Heart rate", "108"],
      ["Aspirin", "300 mg"],
      ["Repeat troponin", "00:30"],
      ["First troponin", "7 ng/L"],
    ],
  },
});

function getSyntheticPackDocument(sha256) {
  return SYNTHETIC_DOCUMENT_PACK[String(sha256 || "").toLowerCase()] || null;
}

module.exports = { SYNTHETIC_DOCUMENT_PACK, getSyntheticPackDocument };
