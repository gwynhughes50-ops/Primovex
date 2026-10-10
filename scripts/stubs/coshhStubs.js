// Stand-ins so the COSHH screens can be rendered in a test with no Firebase or sign-in.
export const stub = { capabilities: ["coshh.read"], list: [], error: "" };
export const useAuth = () => ({ user: { uid: "me", displayName: "Gwyn" }, can: (id) => stub.capabilities.includes("*") || stub.capabilities.includes(id) });
export const useCoshhSubstances = () => ({ list: stub.list, error: stub.error });
export const saveSubstance = async () => {};
export const markReviewed = async () => {};
export const setActive = async () => {};
export const sdsProblem = () => "";
export const db = {};
export const collection = () => ({});
export const onSnapshot = () => () => {};
export const openDocument = async () => "";
export const printHtmlDocument = () => {};
export const getQrImageUrl = (link) => `qr:${link}`;
export const buildNfcUrl = (type, id) => `https://x/sense/open/${type}/${encodeURIComponent(id)}`;
const useSiteSpaceNames = () => ({ siteNames: ["Main Surgery"], spaceNames: ["Cleaners cupboard"], spaceNamesFor: () => ["Cleaners cupboard"], loaded: true });
export default useSiteSpaceNames;
