import { test } from "node:test";
import assert from "node:assert/strict";
import {
  backupSettings,
  moveItem,
  patchPreference,
  readPreference,
  validateBackup,
} from "../src/sync.mjs";

test("native preference edits preserve other settings and their wire types", () => {
  const previous = {
    player_settings: { future_feature: { type: "string", value: "keep me" } },
    future_section: { key: 42 },
  };
  const field = {
    feature: "player_settings",
    key: "preload_next_episode",
    type: "boolean",
  };
  const result = patchPreference(previous, field, true);
  assert.deepEqual(result.player_settings.preload_next_episode, {
    type: "boolean",
    value: true,
  });
  assert.equal(readPreference(result, field), true);
  assert.deepEqual(result.future_section, previous.future_section);
  assert.equal(result.player_settings.future_feature.value, "keep me");
  assert.equal(previous.player_settings.preload_next_episode, undefined);
});
test("reader edits preserve the JSON-string representation and unknown properties", () => {
  const fields = {
    manga_reader_settings_payload:
      '{"readingMode":"WEBTOON","futureField":"keep"}',
  };
  const field = {
    feature: "manga_reader_settings_payload",
    key: "readingMode",
    storage: "json",
  };
  const result = patchPreference(fields, field, "RIGHT_TO_LEFT");
  assert.equal(readPreference(result, field), "RIGHT_TO_LEFT");
  assert.equal(
    JSON.parse(result.manga_reader_settings_payload).futureField,
    "keep",
  );
});
test("set preferences use the native string_set type", () => {
  const field = {
    feature: "player_settings",
    key: "providers",
    type: "stringset",
  };
  const saved = patchPreference({}, field, ["one", "two"]);
  assert.deepEqual(saved.player_settings.providers, {
    type: "string_set",
    value: ["one", "two"],
  });
  assert.deepEqual(readPreference({}, field), []);
});
test("source reorder persists a complete, contiguous ordering", () => {
  assert.deepEqual(moveItem([{ url: "a" }, { url: "b" }, { url: "c" }], 2, 0), [
    { url: "c", sort_order: 0 },
    { url: "a", sort_order: 1 },
    { url: "b", sort_order: 2 },
  ]);
});
test("backup excludes credentials inside native wrappers and string payloads", () => {
  const result = backupSettings({
    features: {
      player_settings: {
        introdb_api_key: { type: "string", value: "secret" },
        preload_next_episode: { type: "boolean", value: true },
      },
      payload: '{"access_token":"secret","theme":"GOLD"}',
    },
  });
  assert.equal(result.features.player_settings.introdb_api_key, undefined);
  assert.equal(
    result.features.player_settings.preload_next_episode.value,
    true,
  );
  assert.deepEqual(JSON.parse(result.features.payload), { theme: "GOLD" });
});
test("unrecognised backup formats are rejected before writing anything", () => {
  assert.throws(() => validateBackup({ profiles: [] }));
  assert.throws(() =>
    validateBackup({ format: "anivio-web-backup", version: 2, profiles: [] }),
  );
});
test("all backup profiles are validated before any restoration begins", () => {
  const entry = { profile: { profile_index: 1 }, settings: { features: {} }, addons: [] };
  const backup = { format: "anivio-web-backup", version: 1, profiles: [entry] };
  assert.equal(validateBackup(backup), backup);
  assert.throws(() => validateBackup({ ...backup, profiles: [entry, entry] }));
  assert.throws(() => validateBackup({ ...backup, profiles: [entry, { profile: { profile_index: 7 } }] }));
  assert.throws(() => validateBackup({ ...backup, profiles: [{ ...entry, addons: "wrong" }] }));
});
