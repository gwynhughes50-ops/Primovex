// Stand-ins so the phone home can be rendered in a test with no Firebase or sign-in.
export const stub = { role: "Practice Manager", capabilities: ["*"], displayName: "Gwyn Hughes", sars: [], concerns: [], items: [], notes: [] };
export const useAuth = () => ({ role: stub.role, capabilities: stub.capabilities, displayName: stub.displayName, user: { uid: "me" }, can: (id) => stub.capabilities.includes("*") || stub.capabilities.includes(id) });
export const useSenseSession = () => ({ activeSenseSession: null });
export const db = {};
export const isSafeSyntheticMode = () => false;
export const collection = () => ({});
export const limit = () => ({});
export const orderBy = () => ({});
export const query = () => ({});
export const onSnapshot = () => () => {};
export const subscribeConcerns = () => () => {};
export const useStock = () => ({ allItems: stub.items });
export const useNotifications = () => ({ rows: stub.notes });
export const useExpirySettings = () => ({});
export default useStock;
export const Timestamp = { fromDate: (d) => d };
export const doc = () => ({});
export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
export const setDoc = async () => {};
export const getFirestore = () => ({});
export const where = () => ({});
export const normalizeStockItemCategory = () => ({ category: "general" });
export const SAR_COLLECTION = "governance_sars";
export const auth = { currentUser: null };

export const useCoshhSubstances = () => ({ list: stub.coshh || null, error: "" });
