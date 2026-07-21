# Mobile Barcode Scanner

This template includes an improved `MobileBarcodeScanner` component that is
designed to give clearer scans and avoid the "blurry" behaviour you saw before.

## Key Improvements

- Requests **higher resolution** video from the camera
- Uses the **environment/back** camera where possible
- Keeps the `<video>` and capture canvas the **same size** to avoid scaling blur
- Uses `@zxing/browser`'s `BrowserMultiFormatReader` to continuously decode
- Provides a clear visual framing box for the user

## Installation

```bash
npm install @zxing/browser
# or
yarn add @zxing/browser
```

## Usage

```tsx
import MobileBarcodeScanner from "@/components/stock/MobileBarcodeScanner";

function InventoryFilters() {
  const [searchQuery, setSearchQuery] = useState("");

  const handleBarcodeScanned = (code: string) => {
    setSearchQuery(code);
  };

  return (
    <div className="flex gap-3">
      <Input
        placeholder="Search by name, barcode, batch"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      <MobileBarcodeScanner onScan={handleBarcodeScanned} />
    </div>
  );
}
```

When the user taps the scanner button, a dialog opens with the camera view.
As soon as a valid barcode is decoded, it calls `onScan(barcode)` and closes.
