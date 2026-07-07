import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Gauge,
  RadioTower,
  Wifi,
  HelpCircle,
  Home,
  LayoutDashboard,
  LifeBuoy,
  LogIn,
  LogOut,
  MapPin,
  Package,
  Plus,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Thermometer,
  User,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

/**
 * Central MedTrak+ icon library.
 *
 * Rule: navigation and shared components should use getIcon("name") rather than
 * rendering Icons.name directly. That prevents a missing icon key from crashing
 * the whole app and gives us a safe fallback while developing new modules.
 */
export const Icons = {
  activity: Activity,
  admin: FileText,
  alerts: AlertTriangle,
  barcodeScan: Camera,
  compliance: ClipboardCheck,
  dashboard: LayoutDashboard,
  departments: Users,
  help: LifeBuoy,
  helpCircle: HelpCircle,
  home: Home,
  inventory: Boxes,
  login: LogIn,
  logout: LogOut,
  notifications: Bell,
  package: Package,
  practice: Building2,
  practiceAdmin: Settings,
  settings: Settings,
  purchasing: ShoppingCart,
  pulse: Sparkles,
  reports: BarChart3,
  reorder: ClipboardList,
  roles: ShieldCheck,
  setupComplete: CheckCircle2,
  check: CheckCircle2,
  sites: MapPin,
  stock: Package,
  suppliers: Building2,
  temperature: Thermometer,
  trash: Trash2,
  user: User,
  userPlus: UserPlus,
  add: Plus,
  governance: ShieldCheck,
  sar: FileText,
  gauge: Gauge,
  connect: RadioTower,
  wifi: Wifi,
};

export const iconGroups = {
  navigation: ["dashboard", "inventory", "reorder", "purchasing", "suppliers", "sar", "practiceAdmin", "alerts", "connect", "temperature", "compliance", "reports", "settings", "help"],
  inventory: ["inventory", "stock", "package", "barcodeScan", "reorder"],
  governance: ["governance", "sar", "compliance", "check"],
  connect: ["connect", "wifi", "temperature", "activity", "alerts"],
  mobile: ["home", "stock", "barcodeScan", "connect", "user", "login", "logout"],
  actions: ["add", "check", "trash", "notifications", "settings"],
  people: ["user", "userPlus", "departments", "roles"],
  insight: ["pulse", "gauge", "reports", "activity"],
};

export function getIcon(name, fallback = "helpCircle") {
  const Icon = Icons?.[name];

  if (Icon) return Icon;

  if (import.meta?.env?.DEV) {
    console.warn(`[MedTrak Icons] Missing icon key: ${name}. Falling back to ${fallback}.`);
  }

  return Icons[fallback] || HelpCircle;
}

export function resolveIcon(iconOrName, fallback = "helpCircle") {
  if (typeof iconOrName === "function") return iconOrName;
  if (typeof iconOrName === "string") return getIcon(iconOrName, fallback);
  return getIcon(fallback);
}

export default Icons;
