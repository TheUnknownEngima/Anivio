import React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Row } from "./api";

function sourceList(folder: Row): Row[] {
  const current = folder.sources as Row[] | undefined;
  return current?.length ? current : (folder.catalogSources as Row[]) || [];
}
function Text({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={String(value || "")}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export default function CollectionBuilder({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  let collection: Row;
  try {
    collection = JSON.parse(value);
  } catch {
    return <p>Fix the advanced document to return to the collection editor.</p>;
  }
  const folders = (collection.folders as Row[]) || [];
  const update = (patch: Row) =>
    onChange(JSON.stringify({ ...collection, ...patch }, null, 2));
  const folder = (index: number, patch: Row) =>
    update({
      folders: folders.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    });
  return (
    <>
      <Text
        label="Collection title"
        value={collection.title}
        onChange={(title) => update({ title })}
      />
      <Text
        label="Collection backdrop URL (optional)"
        value={collection.backdropImageUrl}
        onChange={(backdropImageUrl) =>
          update({ backdropImageUrl: backdropImageUrl || null })
        }
      />
      <label className="check-field">
        <input
          type="checkbox"
          checked={Boolean(collection.pinToTop)}
          onChange={(e) => update({ pinToTop: e.target.checked })}
        />
        <span>Pin this collection to the top</span>
      </label>
      {folders.map((f, index) => (
        <section className="folder-editor" key={String(f.id)}>
          <div className="surface-heading">
            <h3>Folder {index + 1}</h3>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove folder ${index + 1}`}
              onClick={() =>
                update({ folders: folders.filter((_, i) => i !== index) })
              }
            >
              <Trash2 size={15} />
            </button>
          </div>
          <Text
            label="Folder name"
            value={f.title}
            onChange={(title) => folder(index, { title })}
          />
          <Text
            label="Cover image URL (optional)"
            value={f.coverImageUrl}
            onChange={(coverImageUrl) =>
              folder(index, { coverImageUrl: coverImageUrl || null })
            }
          />
          <div className="form-grid">
            <Text
              label="Cover emoji (optional)"
              value={f.coverEmoji}
              onChange={(coverEmoji) => folder(index, { coverEmoji })}
            />
            <label className="field">
              <span>Tile shape</span>
              <select
                value={String(f.tileShape || "poster")}
                onChange={(e) => folder(index, { tileShape: e.target.value })}
              >
                <option value="poster">Poster</option>
                <option value="landscape">Landscape</option>
                <option value="square">Square</option>
              </select>
            </label>
          </div>
          {sourceList(f).map((source, si) => {
            const sources = sourceList(f);
            const sourceUpdate = (patch: Row) =>
              folder(index, {
                sources: sources.map((s, i) =>
                  i === si ? { provider: "addon", ...s, ...patch } : s,
                ),
                catalogSources: [],
              });
            return (
              <div className="catalog-editor" key={si}>
                <div className="surface-heading">
                  <b>Catalog source {si + 1}</b>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove source ${si + 1}`}
                    onClick={() =>
                      folder(index, {
                        sources: sources.filter((_, i) => i !== si),
                        catalogSources: [],
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <label className="field">
                  <span>Provider</span>
                  <select
                    value={String(source.provider || "addon")}
                    onChange={(e) =>
                      sourceUpdate({
                        provider: e.target.value,
                        ...(e.target.value === "tmdb"
                          ? {
                              tmdbSourceType: "DISCOVER",
                              mediaType: "tv",
                              sortBy: "original",
                            }
                          : {}),
                      })
                    }
                  >
                    <option value="addon">Addon catalog</option>
                    <option value="tmdb">TMDB</option>
                  </select>
                </label>
                {source.provider === "tmdb" ? (
                  <>
                    <label className="field">
                      <span>TMDB source</span>
                      <select
                        value={String(source.tmdbSourceType || "DISCOVER")}
                        onChange={(e) =>
                          sourceUpdate({ tmdbSourceType: e.target.value })
                        }
                      >
                        {[
                          "DISCOVER",
                          "LIST",
                          "COLLECTION",
                          "COMPANY",
                          "NETWORK",
                          "PERSON",
                          "DIRECTOR",
                        ].map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                    </label>
                    <Text
                      label="TMDB ID (for a list, company, person, or collection)"
                      value={source.tmdbId}
                      onChange={(id) =>
                        sourceUpdate({ tmdbId: id ? Number(id) : null })
                      }
                    />
                    <label className="field">
                      <span>Media type</span>
                      <select
                        value={String(source.mediaType || "tv")}
                        onChange={(e) =>
                          sourceUpdate({ mediaType: e.target.value })
                        }
                      >
                        <option value="tv">Series</option>
                        <option value="movie">Movies</option>
                      </select>
                    </label>
                  </>
                ) : (
                  <>
                    <Text
                      label="Addon identifier"
                      value={source.addonId}
                      onChange={(addonId) => sourceUpdate({ addonId })}
                    />
                    <div className="form-grid">
                      <Text
                        label="Catalog ID"
                        value={source.catalogId}
                        onChange={(catalogId) => sourceUpdate({ catalogId })}
                      />
                      <Text
                        label="Content type (series, movie, anime)"
                        value={source.type}
                        onChange={(type) => sourceUpdate({ type })}
                      />
                    </div>
                  </>
                )}
                <Text
                  label="Genre filter (optional)"
                  value={source.genre}
                  onChange={(genre) => sourceUpdate({ genre: genre || null })}
                />
              </div>
            );
          })}
          <button
            type="button"
            className="button small"
            onClick={() =>
              folder(index, {
                sources: [
                  ...sourceList(f),
                  {
                    provider: "addon",
                    addonId: "",
                    catalogId: "",
                    type: "series",
                  },
                ],
                catalogSources: [],
              })
            }
          >
            <Plus size={14} /> Add catalog source
          </button>
        </section>
      ))}
      <button
        type="button"
        className="button"
        onClick={() =>
          update({
            folders: [
              ...folders,
              {
                id: crypto.randomUUID(),
                title: "New folder",
                tileShape: "poster",
                sources: [],
              },
            ],
          })
        }
      >
        <Plus size={15} /> Add folder
      </button>
    </>
  );
}
