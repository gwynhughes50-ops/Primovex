# Medicine names for the Orb

The Orb matches what a person says ("one piriton", "chlorpheniramine", "hydrocortiosne") to the
products on the shelf by bringing both to the UK generic name. Where the names come from:

1. A short built-in list of UK/US spelling differences (chlorpheniramine, epinephrine...).
2. `src/data/medicineNames.json`: generic names and brand names. It is loaded on its own, only when
   the Orb first needs it, and used on the device. Nothing is sent anywhere. The file in the repository
   starts as a small seed; replace it with the full list from the NHS dm+d (below).
3. Names this practice has taught the Orb (Admin > Orb > "Names for your stock", saved in
   `settings/orbAliases`).

## Refreshing the list from the NHS dm+d

dm+d (the NHS Dictionary of Medicines and Devices) is the NHS's official medicine name list, free
under the NHS licence from NHS TRUD (https://isd.digital.nhs.uk/trud, needs a free account; subscribe
to "NHS dm+d" under NHSBSA). The BNF itself is licensed content and is not used.

1. Download the latest release zip from TRUD.
2. Run: `node scripts/dmd/build-medicine-names.mjs <the zip or the folder it was unzipped to>`
   (needs the `unzip` command, which Git Bash has). It writes `src/data/medicineNames.json`.
3. `npm run test:medicine-names`, `npm run build`, commit and ship as usual.

The importer reads the VTM (substance), VMP (generic product) and AMP (branded product) files, drops
anything marked invalid, and maps each brand to its substance through its generic product.
Re-run it when a new release is downloaded (the Orb works fine on an older list).

## What the importer does with the list
- Brand names come from the AMP files and lead to their substance (AMP -> VMP -> VTM). Vaccines have no
  substance in dm+d, so they are named from their generic product ("pneumococcal vaccine").
- The first word of a longer brand ("calpol" from "Calpol Six Plus") is added when it means one substance only.
- `scripts/dmd/curated-names.json` holds brands dm+d has no substance for (for example Hypostop); edit it and re-run.
- `src/ai/stock/medicineStoplist.js` lists ordinary words and stock words that must never be treated as a
  brand ("the", "gloves", "nitrile"...). Matching also never "corrects" a word the practice's own stock
  names already use.
- Release used for the committed list: NHS dm+d 10.0.0 (5 October 2026): 3,160 substances, 8,343 brand names.
