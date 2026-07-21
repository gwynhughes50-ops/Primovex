import { useAuth } from "@/contexts/AuthContext";
import AccessDenied from "./AccessDenied";

export default function PermissionGate({ capability, anyOf, children, fallback = null }) {
  const { can, canAny } = useAuth();
  const allowed = capability ? can(capability) : canAny(anyOf || []);
  if (allowed) return children;
  return fallback === null ? <AccessDenied /> : fallback;
}
