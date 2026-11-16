package com.nuvio.app.features.anilist

import com.nuvio.app.core.anilist.AniListMedia
import com.nuvio.app.core.anilist.AniListMediaListEntry
import kotlin.test.*

class AniListProgressWriteTest {
    private fun entry(status: String = "PLANNING", progress: Int = 0, mediaStatus: String = "RELEASING", total: Int? = 12) =
        AniListMediaListEntry(id = 1, status = status, progress = progress,
            media = AniListMedia(id = 123, episodes = total, status = mediaStatus))

    @Test fun firstWatchedEpisodePromotesPlanningInTheSameWrite() {
        assertEquals(AniListProgressWrite(1, "CURRENT"), aniListProgressWrite(entry(), 1))
    }

    @Test fun alreadySyncedProgressStillRepairsThePlanningStatus() {
        assertEquals(AniListProgressWrite(1, "CURRENT"), aniListProgressWrite(entry(progress = 1), 1))
    }

    @Test fun aBackfillNeverLowersProgressWhenRepairingPlanning() {
        assertEquals(AniListProgressWrite(5, "CURRENT"), aniListProgressWrite(entry(progress = 5), 1))
    }

    @Test fun otherExplicitStatusesArePreserved() {
        for (status in listOf("CURRENT", "PAUSED", "DROPPED", "COMPLETED", "REPEATING")) {
            assertEquals(AniListProgressWrite(2, null), aniListProgressWrite(entry(status, 1), 2))
            assertNull(aniListProgressWrite(entry(status, 2), 1))
        }
    }

    @Test fun anAiringTitleIsNotCompletedAtItsCurrentlyKnownEpisodeCount() {
        assertEquals(AniListProgressWrite(1, "CURRENT"), aniListProgressWrite(entry(total = 1), 1))
        assertEquals(AniListProgressWrite(1, "CURRENT"), aniListProgressWrite(entry(total = null), 1))
    }

    @Test fun aFinishedTitleAtItsFinalEpisodeCanComplete() {
        assertEquals(AniListProgressWrite(12, "COMPLETED"), aniListProgressWrite(entry(mediaStatus = "FINISHED"), 12))
    }

    @Test fun aNewEntryStartsWatchingAndZeroProgressDoesNotPromote() {
        assertEquals(AniListProgressWrite(1, "CURRENT"), aniListProgressWrite(null, 1))
        assertNull(aniListProgressWrite(entry(), 0))
        assertNull(aniListProgressWrite(entry(), -1))
    }
}
