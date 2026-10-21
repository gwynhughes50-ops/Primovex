// Stand-ins for the two Firestore names the notification rules import, so they can be tested with no Firebase.
export const serverTimestamp = () => ({ serverTimestamp: true });
export const Timestamp = { fromDate: (date) => ({ toDate: () => date }) };
