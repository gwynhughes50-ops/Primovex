// Finding a person in the team list by typing: "ab" brings Abi to the top, "abi e" narrows to Abi Ellis,
// "ellis abi" and "abi.ellis" find her too. Every word typed must start a word of the person's name (or of
// their email, for people who go by something other than their name), so it narrows with each letter.
// Pure, so it can be tested; used by the Users tab of the Admin Dashboard.

const strip = (text) => String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const words = (text) => strip(text).split(/[^a-z0-9']+/).filter(Boolean);

function profile(user) {
  const nameWords = words(user.displayName || user.name);
  const email = strip(user.email);
  return {
    nameWords,
    name: nameWords.join(" "),
    emailWords: words(email.split("@")[0]),
    email,
  };
}

// 0 = no match, otherwise higher is better.
export function scoreUser(user, query) {
  const typed = words(query);
  if (!typed.length) return 1;
  const p = profile(user);
  const startsAWord = (list, token) => list.some((word) => word.startsWith(token));

  const inName = typed.every((token) => startsAWord(p.nameWords, token));
  const inEmail = typed.every((token) => startsAWord(p.nameWords, token) || startsAWord(p.emailWords, token) || p.email.startsWith(token));
  if (!inName && !inEmail) {
    // nothing starts with it: a run of letters inside a name still counts, but only just
    const inside = typed.every((token) => p.name.includes(token));
    return inside ? 5 : 0;
  }
  let score = inName ? 60 : 30;
  const joined = typed.join(" ");
  if (inName) {
    if (p.name.startsWith(joined)) score += 40; // "abi e" at the start of "abi ellis"
    else if (typed.every((token, i) => p.nameWords[i] && p.nameWords[i].startsWith(token))) score += 30; // in order
    // a typed word that is a whole word of the name beats one that is only the start of it
    score += typed.filter((token) => p.nameWords.includes(token)).length * 4;
    // first name first: typing a first name finds that person before someone with it as a surname
    if (p.nameWords[0] && p.nameWords[0].startsWith(typed[0])) score += 6;
  }
  return score;
}

// The people who match, best first (a tie falls back to name order). An empty search returns everyone as given.
export function searchUsers(users = [], query = "") {
  if (!words(query).length) return users;
  const scored = users.map((user) => ({ user, score: scoreUser(user, query) })).filter((row) => row.score > 0);
  // letters found only inside a name are a last resort: used only when nobody has a word starting with them
  const strong = scored.filter((row) => row.score >= 30);
  return (strong.length ? strong : scored)
    .sort((a, b) => b.score - a.score || String(a.user.displayName || a.user.email || "").localeCompare(String(b.user.displayName || b.user.email || ""), undefined, { sensitivity: "base" }))
    .map((row) => row.user);
}
