import React from "react";
import {
  listAnaphylaxisBoxes,
  getLatestCheck,
  createMonthlyCheck,
  fetchSeedJson,
  seedFromJson,
} from "@/lib/checklistsFirestore";
import ClinicalAssetChecklist from "@/components/assets/ClinicalAssetChecklist";

export default function AnaphylaxisBoxesTab() {
  return (
    <ClinicalAssetChecklist
      title="Anaphylaxis Boxes"
      subtitle="A fast clinical safety check for anaphylaxis boxes. Because vials and split packs may not retain manufacturer barcodes, the box itself receives a Primovex QR identity - scan it with Primovex Mobile to open this checklist directly."
      collectionName="anaphylaxis_boxes"
      entityLabel="box"
      entityLabelPlural="anaphylaxis boxes"
      listEntities={listAnaphylaxisBoxes}
      getLatestCheck={getLatestCheck}
      createCheck={createMonthlyCheck}
      fetchSeedJson={fetchSeedJson}
      seedFromJson={seedFromJson}
      seedResultKey="anaCount"
      seedButtonLabel="Create default anaphylaxis boxes"
      checklistTitle="Anaphylaxis Emergency Box Checklist"
    />
  );
}
