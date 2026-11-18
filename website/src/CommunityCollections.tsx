import React, { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { useProfileSelection, unlockProfile } from "./profile-selection";
import {
  ArrowDown,
  ArrowUpRight,
  BookOpen,
  Check,
  Plus,
  Search,
} from "lucide-react";
import {
  errorMessage,
  profileParams,
  rpc,
  type Profile,
  type Row,
} from "./api";

export default function CommunityCollections({
  session,
}: {
  session: Session | null;
}) {
  const [profileId, setProfile] = useProfileSelection(session?.user.id);
  const [rows, setRows] = useState<Row[]>([]),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [query, setQuery] = useState(""),
    [more, setMore] = useState(false),
    [sharing, setSharing] = useState(false),
    [owned, setOwned] = useState<Row[]>([]);
  async function load(offset = 0) {
    setBusy(true);
    setError("");
    try {
      const next = await rpc<Row[]>("browse_community_collections", {
        p_query: query,
        p_offset: offset,
      });
      setRows(offset ? [...rows, ...next] : next);
      setMore(next.length === 24);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (session)
      rpc<Profile[]>("sync_pull_profiles")
        .then(setProfiles)
        .catch((e) => setError(errorMessage(e)));
  }, [session?.user.id]);
  useEffect(() => {
    if (session)
      rpc<Row[]>("sync_pull_collections", profileParams(profileId))
        .then((data) => setOwned((data[0]?.collections_json as Row[]) || []))
        .catch((e) => setError(errorMessage(e)));
  }, [session?.user.id, profileId]);
  async function share(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get("consent") !== "on") return;
    setBusy(true);
    setError("");
    try {
      await rpc("submit_community_collection", {
        ...profileParams(profileId),
        p_collection_id: String(form.get("collection")),
        p_description: String(form.get("description") || ""),
      });
      setSharing(false);
      setMessage(
        "Submitted for creator review. Your collection appears publicly only after approval.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="shell section">
      <div className="eyebrow">Curated by the community</div>
      <h1 className="page-title">
        Good stories.
        <br />
        Better together.
      </h1>
      <div className="surface-heading">
        <p>
          Discover collections shared by Anivio’s community, then make a copy
          for your own profile.
        </p>
        {session ? (
          <div className="card-actions">
            <select
              aria-label="Collection profile"
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
            <button className="button" onClick={() => setSharing(!sharing)}>
              <Plus size={16} /> Share a collection
            </button>
          </div>
        ) : (
          <a
            className="button"
            href="/account/login?next=/community-collections"
          >
            Sign in to contribute <ArrowUpRight size={16} />
          </a>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="cover-search"
      >
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Search community collections"
            placeholder="Find a collection…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="button primary" disabled={busy}>
          Search
        </button>
      </form>
      {error && (
        <div role="alert" className="message error">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="message">
          {message}
        </div>
      )}
      {sharing && (
        <section className="surface">
          <h2>Share something worth finding.</h2>
          {!owned.length ? (
            <p>Create and sync a collection from your account first.</p>
          ) : (
            <form onSubmit={share}>
              <label className="field">
                <span>Collection</span>
                <select name="collection">
                  {owned.map((c) => (
                    <option value={String(c.id)} key={String(c.id)}>
                      {String(c.title)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>What makes it yours?</span>
                <textarea name="description" rows={3} maxLength={1000} />
              </label>
              <label className="check-field">
                <input type="checkbox" name="consent" required />
                <span>
                  I have reviewed this collection, including its source URLs,
                  and want its contents made public. It contains no private
                  credentials or personal information.
                </span>
              </label>
              <button disabled={busy} className="button primary">
                Submit for review
              </button>
            </form>
          )}
        </section>
      )}
      {busy && !rows.length ? (
        <div className="loading">Finding collections…</div>
      ) : !rows.length ? (
        <div className="empty">
          <BookOpen size={30} />
          <h3>A space for your first discovery.</h3>
          <p>
            No approved collections match yet. Share a collection to help get
            things started.
          </p>
        </div>
      ) : (
        <div className="cover-grid">
          {rows.map((row) => (
            <article className="surface community-card" key={String(row.id)}>
              <div className="eyebrow">
                <BookOpen size={14} /> Community collection
              </div>
              <h2>{String(row.title)}</h2>
              <p>{String(row.description)}</p>
              <small>
                Shared by {String(row.author_name || "Anivio member")}
              </small>
              <details>
                <summary>Preview folders</summary>
                {(((row.collection_json as Row)?.folders as Row[]) || []).map(
                  (f, i) => (
                    <p key={i}>
                      {String(f.title)} ·{" "}
                      {
                        (
                          (f.sources as unknown[]) ||
                          (f.catalogSources as unknown[]) ||
                          []
                        ).length
                      }{" "}
                      sources
                    </p>
                  ),
                )}
              </details>
              {session ? (
                <button
                  disabled={busy}
                  className="button"
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await rpc("import_community_collection", {
                        ...profileParams(profileId),
                        p_publication_id: row.id,
                      });
                      setMessage(
                        "Collection copied to your profile. Refresh the app to sync.",
                      );
                    } catch (e) {
                      setError(errorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <ArrowDown size={15} /> Copy to my profile
                </button>
              ) : (
                <a
                  className="button"
                  href="/account/login?next=/community-collections"
                >
                  Sign in to copy
                </a>
              )}
            </article>
          ))}
        </div>
      )}
      {more && (
        <button
          className="button"
          disabled={busy}
          onClick={() => load(rows.length)}
        >
          Load more <ArrowDown size={15} />
        </button>
      )}
    </section>
  );
}

export function CollectionReview() {
  const [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  async function load() {
    try {
      setRows(await rpc("admin_community_collections"));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <section className="surface">
      <h2>Community collection reviews</h2>
      <p>
        Review shared source URLs before approving a publication. Changes to
        approved collections require a new review.
      </p>
      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {busy ? (
        <div className="loading">Loading submissions…</div>
      ) : !rows.length ? (
        <p>No submissions yet.</p>
      ) : (
        rows.map((row) => (
          <article className="review-row" key={String(row.id)}>
            <h3>{String(row.title)}</h3>
            <p>
              {String(row.author_name)} · {String(row.status)}
            </p>
            <details>
              <summary>Review collection contents</summary>
              <pre className="code-editor">
                {JSON.stringify(row.collection_json, null, 2)}
              </pre>
            </details>
            <div className="card-actions">
              {["approved", "rejected", "pending"].map((status) => (
                <button
                  disabled={busy || row.status === status}
                  className="button small"
                  key={status}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await rpc("admin_review_collection", {
                        p_publication_id: row.id,
                        p_status: status,
                      });
                      await load();
                    } catch (e) {
                      setError(errorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {status === "approved" ? <Check size={14} /> : null}
                  {status === "approved"
                    ? "Approve"
                    : status === "rejected"
                      ? "Reject"
                      : "Return to pending"}
                </button>
              ))}
            </div>
          </article>
        ))
      )}
    </section>
  );
}
