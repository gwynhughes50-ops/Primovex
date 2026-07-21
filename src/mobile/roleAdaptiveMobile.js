import { ClipboardCheck, Package, ScanLine, Sparkles, SprayCan, Stethoscope, Thermometer, Wrench } from "lucide-react";

const normalise = (value = "") => String(value).trim().toLowerCase();

export function getMobilePersona(role, capabilities = []) {
  const roleKey = normalise(role);
  const canInventory = capabilities.includes("*") || capabilities.includes("inventory.write") || capabilities.includes("inventory.adjust");
  const canCompliance = capabilities.includes("*") || capabilities.includes("compliance.recordChecks");

  if (roleKey.includes("nurse") || roleKey.includes("hca") || roleKey.includes("clinician")) {
    return {
      id: "clinical",
      label: role || "Clinical user",
      eyebrow: "Clinical mobile",
      headline: "Fast actions for patient-facing work",
      primary: { key: "scan-stock", label: "Scan stock", helper: "Use 1, 2 or more in seconds", Icon: ScanLine },
      actions: [
        { key: "stock", label: "Stock", helper: "Use or find an item", Icon: Package },
        { key: "room", label: "Scan room", helper: "NFC or QR", Icon: Stethoscope },
        { key: "temperature", label: "Temperature", helper: "Record or review", Icon: Thermometer },
        { key: "checks", label: "Checks", helper: "Clinical readiness", Icon: ClipboardCheck },
      ],
    };
  }

  if (roleKey.includes("cleaner") || roleKey.includes("domestic")) {
    return {
      id: "cleaning",
      label: role || "Cleaning team",
      eyebrow: "Cleaning mobile",
      headline: "Arrive, scan, complete, move on",
      primary: { key: "scan-room", label: "Scan room", helper: "Open the correct cleaning checklist", Icon: ScanLine },
      actions: [
        { key: "room", label: "My room", helper: "NFC or QR", Icon: SprayCan },
        { key: "clean", label: "Complete clean", helper: "One-tap when ready", Icon: ClipboardCheck },
        { key: "issue", label: "Report issue", helper: "Linked to this space", Icon: Wrench },
      ],
    };
  }

  if (roleKey.includes("caretaker") || roleKey.includes("maintenance") || roleKey.includes("estates")) {
    return {
      id: "caretaker",
      label: role || "Caretaker",
      eyebrow: "Facilities mobile",
      headline: "Identify the space and act immediately",
      primary: { key: "scan-room", label: "Scan space or asset", helper: "NFC, QR or barcode", Icon: ScanLine },
      actions: [
        { key: "room", label: "Space context", helper: "Open the right passport", Icon: Wrench },
        { key: "issue", label: "Report issue", helper: "Photo and priority", Icon: ClipboardCheck },
        { key: "checks", label: "Compliance", helper: "Record checks", Icon: Thermometer },
      ],
    };
  }

  if (roleKey.includes("practice manager") || roleKey.includes("system admin") || roleKey.includes("manager")) {
    return {
      id: "manager",
      label: role || "Manager",
      eyebrow: "Operational command",
      headline: "See what needs attention, then act",
      primary: { key: "orb", label: "Ask Orb", helper: "Command Primovex without hunting through menus", Icon: Sparkles },
      actions: [
        { key: "stock", label: "Inventory", helper: "Exceptions and low stock", Icon: Package },
        { key: "room", label: "Spaces", helper: "Practice context", Icon: ScanLine },
        { key: "checks", label: "Compliance", helper: "Outstanding work", Icon: ClipboardCheck },
        { key: "temperature", label: "Temperature", helper: "Cold-chain status", Icon: Thermometer },
      ],
    };
  }

  return {
    id: "general",
    label: role || "Primovex user",
    eyebrow: "Your mobile workspace",
    headline: "The actions you use most, ready first",
    primary: { key: canInventory ? "scan-stock" : "scan-room", label: canInventory ? "Scan stock" : "Scan room", helper: "Fast, context-aware action", Icon: ScanLine },
    actions: [
      ...(canInventory ? [{ key: "stock", label: "Stock", helper: "Find or use items", Icon: Package }] : []),
      { key: "room", label: "Spaces", helper: "NFC or QR", Icon: ScanLine },
      ...(canCompliance ? [{ key: "checks", label: "Checks", helper: "Record compliance", Icon: ClipboardCheck }] : []),
    ],
  };
}
