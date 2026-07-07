export type StockCategory =
  | "non_medical"
  | "medicinal"
  | "vaccines"
  | "emergency_drugs"
  | "dressings"
  | "equipment";

export interface StockItem {
  id?: string;
  name: string;
  barcode?: string;
  category: StockCategory;
  batch_number?: string;
  expiry_date?: string;      // ISO date string: "YYYY-MM-DD"
  site_id?: string;
  location_id?: string;
  photo_url?: string;
  current_stock: number;     // default 0
  min_stock: number;         // default 1
  max_stock: number;         // default 100
  unit: string;              // default "units"
  supplier?: string;
  notes?: string;
  is_active: boolean;        // default true
}

export const defaultStockItem: Partial<StockItem> = {
  current_stock: 0,
  min_stock: 1,
  max_stock: 100,
  unit: "units",
  is_active: true,
};
