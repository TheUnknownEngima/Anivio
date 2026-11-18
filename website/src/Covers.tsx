import React, { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { useProfileSelection, unlockProfile } from "./profile-selection";
import { ArrowUpRight, Check, Search } from "lucide-react";
import {
  clientParams,
  errorMessage,
  profilePayload,
  rpc,
  type Profile,
} from "./api";

type Cover = {
  id: number;
  title: { english?: string; romaji: string };
  bannerImage: string;
  siteUrl: string;
};
export default function Covers({ session }: { session: Session | null }) {
  const [profileId, setProfile] = useProfileSelection(session?.user.id);
  const [items, setItems] = useState<Cover[]>([]),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [profiles, setProfiles] = useState<Profile[]>([]);
  useEffect(() => {
    if (session)
      rpc<Profile[]>("sync_pull_profiles")
        .then(setProfiles)
        .catch((e) => setError(errorMessage(e)));
  }, [session?.user.id]);
  async function search(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query:
            "query($search:String){Page(perPage:36){media(type:ANIME,countryOfOrigin:JP,isAdult:false,search:$search,sort:TRENDING_DESC){id title{english romaji} bannerImage siteUrl}}}",
          variables: { search: query.trim() || null },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(
          "Anime artwork is unavailable right now. Please try again shortly.",
        );
      const payload = await response.json();
      if (payload.errors) throw new Error(payload.errors[0].message);
      setItems(payload.data.Page.media.filter((m: Cover) => m.bannerImage));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    search();
  }, []);
  async function choose(cover: Cover) {
    setBusy(true);
    setError("");
    try {
      const latest = await rpc<Profile[]>("sync_pull_profiles");
      const profile = latest.find((p) => p.profile_index === profileId);
      if (!profile) throw new Error("Select a profile first.");
      await rpc("sync_push_profiles", {
        p_client_max_profiles: 6,
        p_profiles: [
          {
            ...profilePayload(profile),
            profile_background_id: null,
            profile_background_url: cover.bannerImage,
          },
        ],
        ...clientParams(),
      });
      dispatchEvent(new Event("anivio:profiles-updated"));
      setMessage(
        `Banner saved to ${profile.name}. Open Anivio to sync your profile.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="shell section">
      <div className="eyebrow">Your profile / Anime artwork</div>
      <h1 className="page-title">
        A new view.
        <br />A little more you.
      </h1>
      <div className="surface-heading">
        <p>
          Find an anime banner for your profile. Artwork and metadata are
          provided by AniList.
        </p>
        {session && (
          <label className="field">
            <span>Apply to profile</span>
            <select
              value={profileId}
              onChange={async (e) => {
                const id = Number(e.target.value);
                try {
                  if (
                    await unlockProfile(
                      profiles.find((p) => p.profile_index === id),
                    )
                  )
                    setProfile(id);
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              {profiles.map((p) => (
                <option key={p.profile_index} value={p.profile_index}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <form onSubmit={search} className="cover-search">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search anime banners"
            placeholder="Find an anime…"
          />
        </label>
        <button className="button primary" disabled={busy}>
          Search <ArrowUpRight size={16} />
        </button>
      </form>
      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="message" role="status">
          {message}
        </div>
      )}
      {busy && !items.length ? (
        <div className="loading">Finding your next view…</div>
      ) : (
        <div className="cover-grid">
          {items.map((item) => (
            <article className="cover-card" key={item.id}>
              <img
                src={item.bannerImage}
                alt={`${item.title.english || item.title.romaji} banner`}
                loading="lazy"
              />
              <div>
                <h2>{item.title.english || item.title.romaji}</h2>
                <div className="card-actions">
                  {session ? (
                    <button
                      className="button small"
                      disabled={busy}
                      onClick={() => choose(item)}
                    >
                      <Check size={14} /> Use this banner
                    </button>
                  ) : (
                    <a
                      className="button small"
                      href="/account/login?next=/covers"
                    >
                      Sign in to use
                    </a>
                  )}
                  <a
                    className="text-link"
                    href={item.siteUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    AniList <ArrowUpRight size={13} />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {!busy && !items.length && !error && (
        <div className="empty">
          <h3>No landscape banners found.</h3>
          <p>Try another anime title.</p>
        </div>
      )}
    </section>
  );
}
