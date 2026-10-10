// Stand-ins so the message card can be rendered in a test with no Firebase, router or sign-in.
export const stubState = { rows: [], phone: false };
export const useAuth = () => ({ user: { uid: "me" }, displayName: "Gwyn", email: "g@x", can: () => true });
export const collection = () => ({});
export const doc = () => ({});
export const limit = () => ({});
export const orderBy = () => ({});
export const query = () => ({});
export const where = () => ({});
export const serverTimestamp = () => ({});
export const updateDoc = async () => {};
export const onSnapshot = () => () => {};
export const db = {};
export const useNavigate = () => () => {};
export const functions = {};
export const httpsCallable = () => async () => ({ data: { toName: "Ben Jones" } });
export const isSafeSyntheticMode = () => false;
const useNotifications = () => ({ rows: stubState.rows, markRead: async () => {}, snooze: async () => {} });
export default useNotifications;
