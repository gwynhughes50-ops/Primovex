// Stand-ins so the stock item editor can be rendered in a test with no Firebase or Practice Admin data.
export const db = {};
export const collection = () => ({});
export const query = () => ({});
export const onSnapshot = () => () => {};
export const updateStockItem = async () => {};
export const normalizeStockItemCategory = (item) => ({ category: item?.category || "medicines", subcategory: item?.subcategory || "regular-medicines" });
export default function useSiteSpaceNames() {
  return { siteNames: ["Main Surgery", "Branch Surgery"], spaceNames: ["Store", "Emergency Trolley"], spaceNamesFor: (site) => (site === "Main Surgery" ? ["Store", "Emergency Trolley"] : ["Branch Store"]), loaded: true };
}
