#!/usr/bin/env python3
"""Expose the actual Android sync keys and types, rather than copying a different app's settings."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
features = {
    'ThemeSettingsStorage.android.kt': ('theme_settings', 'Appearance'),
    'PlayerSettingsStorage.android.kt': ('player_settings', 'Playback'),
    'StreamBadgeSettingsStorage.android.kt': ('stream_badge_settings', 'Streams'),
    'DebridSettingsStorage.android.kt': ('debrid_settings', 'Integrations'),
    'TmdbSettingsStorage.android.kt': ('tmdb_settings', 'Discovery'),
    'MdbListSettingsStorage.android.kt': ('mdblist_settings', 'Discovery'),
    'TrackingSettingsStorage.android.kt': ('tracking_settings', 'Tracking'),
}
fields = []
for file in (root / 'composeApp/src/androidMain').rglob('*.kt'):
    if file.name not in features:
        continue
    feature, group = features[file.name]
    source = file.read_text(encoding='utf-8')
    constants = dict(re.findall(r'(?:const\s+)?val\s+(\w+)\s*=\s*"([^"\n]+)"', source))
    export = source.split('actual fun exportToSyncPayload()', 1)
    if len(export) < 2:
        continue
    export = export[1].split('actual fun replaceFromSyncPayload', 1)[0]
    seen = set()
    for match in re.finditer(r'put\((\w+),\s*encodeSync(StringSet|String|Boolean|Int|Float)\(', export):
        key, value_type = constants.get(match[1]), match[2].lower()
        if not key or key in seen or re.search(r'api_key|token|secret|client_id', key):
            continue
        seen.add(key)
        fields.append(dict(feature=feature, key=key, type=value_type, group=group, title=key.replace('_', ' ').capitalize()))
fields.sort(key=lambda f: (f['group'], f['feature'], f['key']))
target = root / 'website/src/generated-settings.json'
target.write_text(json.dumps(fields, indent=2) + '\n')
print(f'Generated {len(fields)} native preference fields')
