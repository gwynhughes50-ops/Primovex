import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeMyPublished, subscribeTeamAccess, teamUid } from "@/modules/rota/rotaTeamService";

// Is this person on the reception rota, with the team's access switched on and at least one published week that lists them? Only then do
// the rota things (My rota, "show my shifts") mean anything to them.
export function useOnRota() {
  const { user } = useAuth();
  const [onRota, setOnRota] = useState(false);
  useEffect(() => {
    if (!user?.uid) { setOnRota(false); return undefined; }
    let access = false; let weeks = 0;
    const update = () => setOnRota(access && weeks > 0);
    const stopAccess = subscribeTeamAccess((on) => { access = on; update(); }, () => { access = false; update(); });
    const stopWeeks = subscribeMyPublished(teamUid(user.uid), (map) => { weeks = Object.keys(map || {}).length; update(); }, () => { weeks = 0; update(); });
    return () => { stopAccess(); stopWeeks(); };
  }, [user?.uid]);
  return onRota;
}
