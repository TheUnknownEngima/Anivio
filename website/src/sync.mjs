// App preferences use typed wrappers; writing a raw boolean would be ignored by Android.
export function readPreference(features, field) {
  if (field.storage === "json") {
    try {
      return (
        JSON.parse(features[field.feature] || "{}")[field.key] ?? field.default
      );
    } catch {
      return field.default;
    }
  }
  const item = features[field.feature]?.[field.key];
  if (field.feature === "notifications_settings")
    return item ?? field.default ?? false;
  return (
    item?.value ??
    field.default ??
    (field.type === "boolean"
      ? false
      : field.type === "stringset"
        ? []
        : field.type === "string"
          ? ""
          : 0)
  );
}
export function patchPreference(features, field, value) {
  if (field.storage === "json") {
    let payload = {};
    try {
      payload = JSON.parse(features[field.feature] || "{}");
    } catch {}
    return {
      ...features,
      [field.feature]: JSON.stringify({ ...payload, [field.key]: value }),
    };
  }
  return {
    ...features,
    [field.feature]: {
      ...features[field.feature],
      [field.key]:
        field.feature === "notifications_settings"
          ? value
          : {
              type: field.type === "stringset" ? "string_set" : field.type,
              value,
            },
    },
  };
}
export function backupSettings(value) {
  if (typeof value === "string" && /^[\[{]/.test(value.trim())) {
    try {
      return JSON.stringify(backupSettings(JSON.parse(value)));
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map(backupSettings);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/api_key|access_token|refresh_token|password|client_secret|credential/i.test(
              key,
            ),
        )
        .map(([key, v]) => [key, backupSettings(v)]),
    );
  return value;
}
export function validateBackup(value) {
  if (
    !value ||
    value.format !== "anivio-web-backup" ||
    value.version !== 1 ||
    !Array.isArray(value.profiles)
  )
    throw new Error("This is not a supported Anivio backup.");
  const ids = new Set();
  const object = (v) => v && typeof v === "object" && !Array.isArray(v);
  if (value.profiles.length > 6) throw new Error("Backup contains too many profiles.");
  for (const entry of value.profiles) {
    const id = entry?.profile?.profile_index;
    if (!Number.isInteger(id) || id < 1 || id > 6 || ids.has(id)) throw new Error("Invalid or repeated profile in backup.");
    ids.add(id);
    if (!object(entry.settings?.features)) throw new Error("Invalid profile preferences in backup.");
    for (const key of ["addons", "plugins", "collections", "progress", "library", "watched"]) {
      if (entry[key] !== undefined && (!Array.isArray(entry[key]) || entry[key].some(row => !object(row)))) throw new Error(`Invalid ${key} in backup.`);
    }
  }
  return value;
}
export function moveItem(items, from, to) {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length)
    return items;
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next.map((row, index) => ({ ...row, sort_order: index }));
}
