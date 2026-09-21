import { doc, getDoc, setDoc } from "firebase/firestore";

// Why this exists: if the connection drops after the server has saved a write,
// the Firestore client re-sends it. A plain addDoc is a create-only write, so
// the re-send is refused ("already exists") even though the save worked — the
// person sees an error, saves again, and makes a duplicate. And for records
// that are never edited after creation, even a set() re-send is refused
// ("permission denied"), for the same reason. Both look like a failed save
// when the record is in fact there.

// Same as addDoc (returns the new document reference), but the id is made up
// front and the write is a set, so a re-send re-saves the same record. If the
// write still reports one of the two "already there" errors, the record's own
// id is checked: if it exists, this save worked. Anything else — including a
// genuine permission problem, where nothing was written — is thrown as before.
export async function addDocResendSafe(collectionRef, data) {
  const ref = doc(collectionRef);
  try {
    await setDoc(ref, data);
  } catch (err) {
    if (await landedDespiteError(err, ref)) return ref;
    throw err;
  }
  return ref;
}

// For a batch that creates a never-edited record (an audit or event entry).
// Pass that record's reference: it's unique to this call, so if it exists after
// a reported failure, the whole batch committed.
export async function commitBatchResendSafe(batch, sentinelRef) {
  try {
    await batch.commit();
  } catch (err) {
    if (await landedDespiteError(err, sentinelRef)) return;
    throw err;
  }
}

async function landedDespiteError(err, ref) {
  if (err?.code !== "permission-denied" && err?.code !== "already-exists") return false;
  try {
    return (await getDoc(ref)).exists();
  } catch {
    return false;
  }
}
