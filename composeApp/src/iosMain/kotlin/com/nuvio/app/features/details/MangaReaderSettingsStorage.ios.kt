package com.nuvio.app.features.details

import platform.Foundation.NSUserDefaults
import com.nuvio.app.core.storage.ProfileScopedKey
import com.nuvio.app.features.profiles.ProfileRepository

actual object MangaReaderSettingsStorage {
    private const val payloadKey = "manga_reader_settings_payload"

    actual fun loadPayload(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(ProfileScopedKey.of(payloadKey))
            ?: NSUserDefaults.standardUserDefaults.stringForKey(payloadKey)?.takeIf { ProfileRepository.activeProfileId == 1 }

    actual fun savePayload(payload: String) {
        NSUserDefaults.standardUserDefaults.setObject(payload, forKey = ProfileScopedKey.of(payloadKey))
    }
}
