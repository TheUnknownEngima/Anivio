import React, { createContext, useContext, useEffect, useState } from "react";
import { safeUrl, type Profile } from "./api";

export type SupporterTier = "SUPPORTER" | "SUPPORTER_PLUS";
export const SupporterStyle = createContext<{
  tier?: SupporterTier;
  gradient?: string;
}>({});

function supporterLabel(tier: SupporterTier) {
  return tier === "SUPPORTER_PLUS" ? "Supporter Plus" : "Supporter";
}

export function SupporterBadge() {
  const { tier } = useContext(SupporterStyle);
  return tier ? <span className="supporter-badge">{supporterLabel(tier)}</span> : null;
}
const characters = new Map<number, Promise<string | undefined>>();
function characterImage(id: number) {
  if (!characters.has(id))
    characters.set(
      id,
      fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "query($id:Int){Character(id:$id){image{large}}}",
          variables: { id },
        }),
        signal: AbortSignal.timeout(10000),
      })
        .then((r) => r.json())
        .then((r) => safeUrl(r.data?.Character?.image?.large))
        .catch(() => undefined),
    );
  return characters.get(id)!;
}
export default function ProfileAvatar({
  profile,
  large = false,
}: {
  profile?: Profile;
  large?: boolean;
}) {
  const { tier, gradient } = useContext(SupporterStyle);
  const ringTier = profile ? tier : undefined;
  const direct = safeUrl(profile?.avatar_url),
    identity = String(profile?.avatar_id || "");
  const [resolved, setResolved] = useState<{ identity: string; url?: string }>({
    identity: "",
  });
  useEffect(() => {
    let active = true;
    const id = /^anilist-character:(\d+)$/.exec(identity)?.[1];
    if (!direct && id)
      characterImage(Number(id)).then((url) => {
        if (active) setResolved({ identity, url });
      });
    return () => {
      active = false;
    };
  }, [identity, direct]);
  const url =
    direct || (resolved.identity === identity ? resolved.url : undefined);
  return (
    <span
      className={`avatar ${large ? "large" : ""}`}
      data-supporter={ringTier}
      style={{
        background: profile?.avatar_color_hex || "#b2c4a2",
        ...(gradient ? { "--supporter-gradient": gradient } : {}),
      }}
      title={
        ringTier
          ? supporterLabel(ringTier)
          : profile?.avatar_url === "discord://avatar"
            ? "Uses your linked Discord picture in the app"
            : undefined
      }
    >
      {url ? <img src={url} alt="" /> : (profile?.name || "A")[0]}
    </span>
  );
}
