import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enrichMedia,
  presentMedia,
  mediaIdentity,
} from "../src/media-metadata.mjs";

test("watch-progress IDs resolve titles and artwork without changing progress identity", async () => {
  const row = {
    content_id: "anilist:2322",
    progress_key: "anilist:2322_s1e2",
    episode: 2,
    position: 42000,
    duration: 1440000,
  };
  let calls = 0;
  const result = await enrichMedia(
    [row, { ...row, episode: 3 }],
    [],
    async (url, options) => {
      calls++;
      assert.equal(url, "https://graphql.anilist.co");
      const query = JSON.parse(options.body);
      assert.deepEqual(query.variables.ids, [2322]);
      assert.match(query.query, /id_in/);
      return {
        ok: true,
        json: async () => ({
          data: {
            Page: {
              media: [
                {
                  id: 2322,
                  title: { english: "Exact sequel title" },
                  coverImage: { extraLarge: "https://example.com/poster.jpg" },
                  bannerImage: "https://example.com/banner.jpg",
                },
              ],
            },
          },
        }),
      };
    },
  );
  assert.equal(calls, 1);
  assert.equal(result[0].displayTitle, "Exact sequel title");
  assert.equal(result[0].displayPoster, "https://example.com/poster.jpg");
  assert.equal(result[0].displayBackground, "https://example.com/banner.jpg");
  for (const key of Object.keys(row)) assert.equal(result[0][key], row[key]);
});

test("watched episodes reuse exact library artwork and preserve a sequel's distinct ID", async () => {
  const row = {
    content_id: "anilist:999700",
    title: "Episode one",
    episode: 1,
  };
  const result = await enrichMedia(
    [row],
    [
      {
        content_id: "anilist:999699",
        name: "Prequel",
        poster: "https://example.com/old.jpg",
      },
      {
        content_id: "anilist:999700",
        name: "Sequel",
        poster: "https://example.com/new.jpg",
      },
    ],
    () => {
      throw new Error("Complete saved metadata should not need a request");
    },
  );
  assert.equal(result[0].displayTitle, "Sequel");
  assert.equal(result[0].displayPoster, "https://example.com/new.jpg");
});

test("metadata failures keep saved activity usable and unsafe artwork is rejected", async () => {
  const row = {
    content_id: "anilist:999701",
    title: "Saved title",
    poster: "javascript:bad",
    watched_at: 123,
  };
  const [result] = await enrichMedia([row], [], async () => {
    throw new Error("offline");
  });
  assert.equal(result.displayTitle, "Saved title");
  assert.equal(result.displayPoster, undefined);
  assert.equal(result.watched_at, 123);
  assert.equal(
    presentMedia({ content_id: "anilist:999702", title: "anilist:999702" })
      .displayTitle,
    "Anime 999702",
  );
  assert.equal(mediaIdentity("anilist:22_s1e1"), undefined);
});

test("MAL IDs use the correct external-ID filter rather than AniList IDs or title search", async () => {
  const [row] = await enrichMedia(
    [{ content_id: "mal:999703" }],
    [],
    async (_url, options) => {
      assert.match(JSON.parse(options.body).query, /idMal_in/);
      return {
        ok: true,
        json: async () => ({
          data: {
            Page: {
              media: [
                {
                  id: 555,
                  idMal: 999703,
                  title: { romaji: "Matched MAL anime" },
                  coverImage: { large: "https://example.com/mal.jpg" },
                },
              ],
            },
          },
        }),
      };
    },
  );
  assert.equal(row.displayTitle, "Matched MAL anime");
});
