import React, { useEffect, useState, type FormEvent } from "react";
import { Monitor, Plus, Trash2 } from "lucide-react";
import {
  clientParams,
  errorMessage,
  profileParams,
  rpc,
  safeUrl,
  type Row,
} from "./api";

export default function MediaServers({ profileId }: { profileId: number }) {
  const [servers, setServers] = useState<Row[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [adding, setAdding] = useState(false);
  useEffect(() => {
    rpc<{ servers: Row[] }[]>(
      "sync_pull_media_servers",
      profileParams(profileId),
    )
      .then((rows) => setServers(rows[0]?.servers || []))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  }, [profileId]);
  async function save(next: Row[]) {
    await rpc("sync_push_media_servers", {
      ...profileParams(profileId),
      p_servers: next,
      ...clientParams(),
    });
    setServers(next);
    setMessage("Server connections saved.");
  }
  async function connect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const address = String(f.get("address")).trim().replace(/\/$/, ""),
        provider = String(f.get("provider"));
      if (!safeUrl(address))
        throw new Error("Use an HTTPS address this browser can reach.");
      const base = address + (provider === "emby" ? "/emby" : "");
      const authorization =
        'MediaBrowser Client="Anivio Web", Device="Browser", DeviceId="anivio-web", Version="1.0.0"';
      const response = await fetch(`${base}/Users/AuthenticateByName`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Emby-Authorization": authorization,
        },
        body: JSON.stringify({
          Username: String(f.get("username")),
          Pw: String(f.get("password")),
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok)
        throw new Error(
          "Server sign-in failed. Check the address, username, and password.",
        );
      const session = await response.json();
      if (!session.AccessToken || !session.User?.Id)
        throw new Error("The server returned an invalid sign-in response.");
      const views = await fetch(
        `${base}/Users/${encodeURIComponent(session.User.Id)}/Views`,
        {
          headers: {
            "X-Emby-Token": session.AccessToken,
            "X-Emby-Authorization": authorization,
          },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!views.ok)
        throw new Error(
          "Signed in, but the server did not allow library access.",
        );
      const libraries = await views.json();
      const server = {
        id: crypto.randomUUID(),
        provider_id: provider,
        name: new URL(address).hostname,
        address,
        remote_server_id: session.ServerId || new URL(address).hostname,
        remote_user_id: session.User.Id,
        user_name: session.User.Name || String(f.get("username")),
        token: session.AccessToken,
        enabled: true,
        use_catalog_metadata: false,
        import_watch_state: false,
        libraries: (libraries.Items || []).map((v: Row) => ({
          id: v.Id,
          name: v.Name,
          kind:
            v.CollectionType === "tvshows"
              ? "series"
              : v.CollectionType === "movies"
                ? "movie"
                : "mixed",
          selected: true,
        })),
      };
      const next = servers.filter(
        (s) =>
          !(
            s.provider_id === server.provider_id &&
            s.remote_server_id === server.remote_server_id &&
            s.remote_user_id === server.remote_user_id
          ),
      );
      await save([...next, server]);
      form.reset();
      setAdding(false);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "This browser could not reach the server. Check HTTPS and the server’s CORS settings."
          : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="surface">
        <div className="surface-heading">
          <div>
            <h2>Your library, on your terms.</h2>
            <p>
              Connect your Jellyfin or Emby server. Your password is used only
              to sign in.
            </p>
          </div>
          <button className="button" onClick={() => setAdding(!adding)}>
            <Plus size={16} /> Add server
          </button>
        </div>
        <p className="fine-print">
          Connections are saved to this profile. Direct server playback in the
          Android app requires the media-server module; addon and plugin
          playback works independently.
        </p>
      </div>
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
      {adding && (
        <section className="surface">
          <h2>Connect a server</h2>
          <form onSubmit={connect}>
            <label className="field">
              <span>Server type</span>
              <select name="provider">
                <option value="jellyfin">Jellyfin</option>
                <option value="emby">Emby</option>
              </select>
            </label>
            <label className="field">
              <span>Server address</span>
              <input
                name="address"
                type="url"
                placeholder="https://your-server.example"
                required
              />
            </label>
            <div className="form-grid">
              <label className="field">
                <span>Username</span>
                <input name="username" autoComplete="off" required />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="off"
                  required
                />
              </label>
            </div>
            <button className="button primary" disabled={busy}>
              {busy ? "Connecting…" : "Connect server"}
            </button>
          </form>
        </section>
      )}
      {!busy && !servers.length && !error && (
        <div className="empty">
          <Monitor size={30} />
          <h3>No servers connected yet.</h3>
          <p>Add a server you own or are authorised to use.</p>
        </div>
      )}
      {servers.map((s) => (
        <section key={String(s.id)} className="surface">
          <div className="surface-heading">
            <div>
              <h2>{String(s.name)}</h2>
              <p>
                {String(s.provider_id)} · {String(s.user_name)}
              </p>
            </div>
            <button
              className="icon-button"
              aria-label={`Remove ${s.name}`}
              disabled={busy}
              onClick={async () => {
                if (!confirm("Remove this saved server connection?")) return;
                setBusy(true);
                try {
                  await save(servers.filter((v) => v.id !== s.id));
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={17} />
            </button>
          </div>
          <label className="setting-row">
            <b>Enable connection</b>
            <input
              type="checkbox"
              role="switch"
              checked={s.enabled !== false}
              disabled={busy}
              onChange={async (e) => {
                setBusy(true);
                try {
                  await save(
                    servers.map((v) =>
                      v.id === s.id ? { ...v, enabled: e.target.checked } : v,
                    ),
                  );
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {((s.libraries as Row[]) || []).map((l) => (
            <label className="setting-row" key={String(l.id)}>
              <b>{String(l.name)}</b>
              <input
                type="checkbox"
                role="switch"
                checked={l.selected !== false}
                disabled={busy}
                onChange={async (e) => {
                  setBusy(true);
                  try {
                    await save(
                      servers.map((v) =>
                        v.id === s.id
                          ? {
                              ...v,
                              libraries: (s.libraries as Row[]).map((item) =>
                                item.id === l.id
                                  ? { ...item, selected: e.target.checked }
                                  : item,
                              ),
                            }
                          : v,
                      ),
                    );
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
          ))}
        </section>
      ))}
    </>
  );
}
