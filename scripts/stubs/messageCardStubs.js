// Stand-ins so the message card can be rendered in a test with no Firebase, router or sign-in.
export const stubState = { rows: [], phone: false };
export const useAuth = () => ({ user: { uid: "me" } });
export const useNavigate = () => () => {};
export const functions = {};
export const httpsCallable = () => async () => ({ data: { toName: "Ben Jones" } });
export const isSafeSyntheticMode = () => false;
const useNotifications = () => ({ rows: stubState.rows, markRead: async () => {}, snooze: async () => {} });
export default useNotifications;
