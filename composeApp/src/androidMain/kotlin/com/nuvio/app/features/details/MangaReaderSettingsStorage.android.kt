package com.nuvio.app.features.details

import android.content.Context
import android.content.SharedPreferences
import com.nuvio.app.core.storage.ProfileScopedKey
import com.nuvio.app.features.profiles.ProfileRepository

actual object MangaReaderSettingsStorage {
    private const val preferencesName = "nuvio_manga_reader_settings"
    private const val payloadKey = "manga_reader_settings_payload"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    }

    actual fun loadPayload(): String? =
        preferences?.getString(ProfileScopedKey.of(payloadKey), null)
            ?: preferences?.getString(payloadKey, null)?.takeIf { ProfileRepository.activeProfileId == 1 }

    actual fun savePayload(payload: String) {
        preferences
            ?.edit()
            ?.putString(ProfileScopedKey.of(payloadKey), payload)
            ?.apply()
    }
}
