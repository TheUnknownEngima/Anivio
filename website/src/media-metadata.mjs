// Metadata enriches the display only. Original IDs and episode/progress fields
// always remain the native sync identity; never match sequels by title search.
const cache = new Map();
const validTitle = (value) =>
  typeof value === "string" &&
  value.trim() &&
  !/^(?:anilist|mal|tmdb|kitsu):\d+$|^tt\d+$/i.test(value.trim());
const imageUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
};
export function mediaIdentity(value) {
  const id = String(value || "");
  const match = /^(anilist|mal):(\d+)$/i.exec(id);
  return match
    ? { provider: match[1].toLowerCase(), id: Number(match[2]) }
    : undefined;
}
export function presentMedia(row, saved, remote) {
  const title = [saved?.name, remote?.title, row.name, row.title].find(
    validTitle,
  );
  const id = String(row.content_id || "");
  return {
    ...row,
    displayTitle:
      title?.trim() ||
      (mediaIdentity(id) ? `Anime ${mediaIdentity(id).id}` : "Untitled media"),
    displayPoster: [row.poster, saved?.poster, remote?.poster]
      .map(imageUrl)
      .find(Boolean),
    displayBackground: [row.background, saved?.background, remote?.background]
      .map(imageUrl)
      .find(Boolean),
    metadataUrl: imageUrl(remote?.url),
  };
}

export async function enrichMedia(rows, library = [], request = fetch) {
  const saved = new Map(library.map((row) => [String(row.content_id), row]));
  const identities = new Map();
  for (const row of rows) {
    const key = String(row.content_id);
    const own = saved.get(key);
    if (
      (!validTitle(own?.name || row.name || row.title) ||
        !imageUrl(own?.poster || row.poster)) &&
      !cache.has(key)
    ) {
      const identity = mediaIdentity(key);
      if (identity) identities.set(key, identity);
    }
  }
  for (const provider of ["anilist", "mal"]) {
    const pending = [...identities].filter(
      ([, identity]) => identity.provider === provider,
    );
    for (let offset = 0; offset < pending.length; offset += 50) {
      const batch = pending.slice(offset, offset + 50);
      try {
        const response = await request("https://graphql.anilist.co", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            query: `query($ids:[Int]){Page(perPage:50){media(${provider === "anilist" ? "id_in" : "idMal_in"}:$ids){id idMal title{english romaji native} coverImage{large extraLarge} bannerImage siteUrl}}}`,
            variables: { ids: batch.map(([, identity]) => identity.id) },
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) continue;
        const payload = await response.json();
        for (const media of payload.data?.Page?.media || []) {
          const key = `${provider}:${provider === "anilist" ? media.id : media.idMal}`;
          cache.set(key, {
            title:
              media.title?.english ||
              media.title?.romaji ||
              media.title?.native,
            poster: media.coverImage?.extraLarge || media.coverImage?.large,
            background: media.bannerImage,
            url: media.siteUrl,
          });
        }
      } catch {
        /* Keep saved activity usable when artwork providers are offline. */
      }
    }
  }
  // IMDb IDs use an exact-ID public catalogue lookup, without requiring a TMDB key.
  const imdb = [...new Set(rows.map((row) => String(row.content_id)))].filter(
    (id) =>
      /^tt\d+$/.test(id) && !cache.has(id) && !imageUrl(saved.get(id)?.poster),
  );
  for (let offset = 0; offset < imdb.length; offset += 4) {
    await Promise.all(
      imdb.slice(offset, offset + 4).map(async (id) => {
        const row = rows.find((row) => row.content_id === id);
        const type = row?.content_type === "movie" ? "movie" : "series";
        try {
          const response = await request(
            `https://v3-cinemeta.strem.io/meta/${type}/${id}.json`,
            { signal: AbortSignal.timeout(10000) },
          );
          if (!response.ok) return;
          const { meta } = await response.json();
          if (meta?.imdb_id === id || meta?.id === id)
            cache.set(id, {
              title: meta.name,
              poster: meta.poster,
              background: meta.background,
            });
        } catch {
          /* The original saved title remains available. */
        }
      }),
    );
  }
  if (cache.size > 1500)
    for (const key of [...cache.keys()].slice(0, 500)) cache.delete(key);
  return rows.map((row) =>
    presentMedia(
      row,
      saved.get(String(row.content_id)),
      cache.get(String(row.content_id)),
    ),
  );
}
