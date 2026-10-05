import React from "react";
import {
  listAnaphylaxisBoxes,
  getLatestCheck,
  createMonthlyCheck,
  fetchSeedJson,
  seedFromJson,
} from "@/lib/checklistsFirestore";
import ClinicalAssetChecklist from "@/components/assets/ClinicalAssetChecklist";
import AnaphylaxisGuidance from "@/components/Inventory/AnaphylaxisGuidance";

export default function AnaphylaxisBoxesTab() {
  return (
    <ClinicalAssetChecklist
      title="Anaphylaxis Boxes"
      subtitle="Anaphylaxis boxes and their contents. Checks are done in the Primovex mobile app: because vials and split packs may not retain manufacturer barcodes, each box has a Primovex QR label - scan it to start the check. Select a box here to manage its contents."
      hideVerificationChecklist
      belowContent={<AnaphylaxisGuidance />}
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
