import { useEffect, useState } from "react";
import { rpc, type Profile, type Row } from "./api";

const keyFor = (userId: string) => `anivio-web-profile:${userId}`;
export function useProfileSelection(userId?: string) {
  const read = () => {
    if (!userId) return 1;
    const value = Number(localStorage.getItem(keyFor(userId)));
    return Number.isInteger(value) && value >= 1 && value <= 6 ? value : 1;
  };
  const [id, setId] = useState(read);
  useEffect(() => {
    const update = () => setId(read());
    update();
    addEventListener("storage", update);
    addEventListener("anivio:profile-selected", update);
    return () => {
      removeEventListener("storage", update);
      removeEventListener("anivio:profile-selected", update);
    };
  }, [userId]);
  function select(id: number) {
    if (!userId || !Number.isInteger(id) || id < 1 || id > 6) return;
    localStorage.setItem(keyFor(userId), String(id));
    setId(id);
    dispatchEvent(new Event("anivio:profile-selected"));
  }
  return [id, select] as const;
}

export async function unlockProfile(profile: Profile | undefined) {
  if (!profile) return false;
  const change = new Event("anivio:navigate", { cancelable: true });
  if (!dispatchEvent(change)) return false;
  if (!profile.pin_enabled) return true;
  const pin = prompt(`Enter the PIN for ${profile.name}`);
  if (!pin) return false;
  const result = await rpc<Row | Row[]>("verify_profile_pin", {
    p_profile_id: profile.profile_index,
    p_pin: pin,
  });
  const row = Array.isArray(result) ? result[0] : result;
  if (!row?.unlocked) throw new Error("The PIN was not accepted.");
  return true;
}
