import React from "react";
import {
  listEmergencyAssets,
  getLatestCheck,
  createMonthlyCheck,
  fetchSeedJson,
  seedFromJson,
} from "@/lib/checklistsFirestore";
import ClinicalAssetChecklist from "@/components/assets/ClinicalAssetChecklist";

export default function EmergencyMonthlyChecklistTab() {
  return (
    <ClinicalAssetChecklist
      title="Emergency Drugs & Equipment"
      subtitle="A clinical readiness view for emergency kits, resus equipment and practice grab bags. Each physical set can be retrofitted with a MedTrak QR label so staff can scan the kit and complete the correct check instantly."
      collectionName="emergency_assets"
      entityLabel="kit"
      entityLabelPlural="emergency kits"
      listEntities={listEmergencyAssets}
      getLatestCheck={getLatestCheck}
      createCheck={createMonthlyCheck}
      fetchSeedJson={fetchSeedJson}
      seedFromJson={seedFromJson}
      seedResultKey="emergencyCount"
      seedButtonLabel="Create default emergency kits"
      checklistTitle="Emergency Drugs and Equipment Checklist"
      enableSections
    />
  );
}
