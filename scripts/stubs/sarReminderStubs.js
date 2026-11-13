// Stand-ins so the reminder bell can be rendered in a test with no Firebase.
export const sendSarReminder = async () => ({ sent: true });
export const fetchSarsToChase = async () => ({ canChase: false, rows: [] });
