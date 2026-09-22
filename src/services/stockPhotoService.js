import { deleteObject, getDownloadURL, ref, uploadString } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { updateStockItem } from "./stockService";

// A phone camera or webcam frame is easily several MB once captured — far
// too large to store directly in the item's Firestore record (Firestore
// refuses any document over 1MB outright, which is why a captured photo
// previously appeared to save with no error and then simply wasn't there:
// the write was failing silently in the background). This resizes to a
// sensible size before it ever leaves the device, so it uploads quickly even
// on a poor connection and is still perfectly clear as a "what does this
// item look like" reference photo.
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.75;

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read the captured photo."));
    img.src = dataUrl;
  });
}

export async function resizeDataUrl(dataUrl, maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY) {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

// Uploads a captured photo for a stock item to Firebase Storage (the actual
// image bytes never touch the Firestore item record - only its Storage
// download URL does) and points the item at it. Replaces any previous photo,
// so Storage doesn't quietly accumulate old versions nobody can see again.
export async function uploadStockItemPhoto(item, dataUrl) {
  if (!item?.id) throw new Error("Item is required.");
  const resized = await resizeDataUrl(dataUrl);
  const path = `stock_photos/${item.id}/${Date.now()}.jpg`;
  const fileRef = ref(storage, path);
  await uploadString(fileRef, resized, "data_url", { contentType: "image/jpeg" });
  const url = await getDownloadURL(fileRef);
  await updateStockItem(item.id, { photo_url: url, photo_path: path });

  const previousPath = item.photo_path;
  if (previousPath && previousPath !== path) {
    try {
      await deleteObject(ref(storage, previousPath));
    } catch (error) {
      // Not fatal - the new photo is already saved and showing. An orphaned
      // old file just sits unused in Storage rather than blocking anything.
      console.warn("Previous stock photo could not be removed from storage.", error);
    }
  }
  return url;
}

// Removes a stock item's photo, from both the item record and Storage.
export async function removeStockItemPhoto(item) {
  if (!item?.id) return;
  const previousPath = item.photo_path;
  await updateStockItem(item.id, { photo_url: "", photo_path: "" });
  if (previousPath) {
    try {
      await deleteObject(ref(storage, previousPath));
    } catch (error) {
      console.warn("Stock photo could not be deleted from storage.", error);
    }
  }
}
