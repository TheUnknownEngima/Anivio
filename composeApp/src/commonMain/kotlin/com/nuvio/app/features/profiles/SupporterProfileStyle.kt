package com.nuvio.app.features.profiles

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.core.ui.LocalThemePalette
import com.nuvio.app.features.membership.MemberAccessRepository
import com.nuvio.app.features.membership.MemberTier
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.community_membership_tier_supporter
import nuvio.composeapp.generated.resources.community_membership_tier_supporter_plus
import org.jetbrains.compose.resources.stringResource

@Composable
internal fun Modifier.supporterAvatarRing(compact: Boolean = false, insetAvatar: Boolean = false): Modifier {
    val access by MemberAccessRepository.access.collectAsStateWithLifecycle()
    val brush = when (access.tier) {
        null -> return this
        MemberTier.SUPPORTER -> SolidColor(Color(0xFFD6AB62))
        MemberTier.SUPPORTER_PLUS -> {
            val palette = LocalThemePalette.current
            val colors = palette.accentGradient.takeIf { it.size > 1 }
                ?: listOf(palette.focusRing, palette.secondary, palette.secondaryVariant)
            Brush.linearGradient(colors)
        }
    }
    val ring = border(if (compact) 1.dp else 1.5.dp, brush, CircleShape)
    return if (insetAvatar) ring.padding(if (compact) 2.dp else 3.dp) else ring
}

@Composable
internal fun SupporterProfileLabel(tier: MemberTier?, textColor: Color) {
    val label = when (tier) {
        null -> return
        MemberTier.SUPPORTER -> Res.string.community_membership_tier_supporter
        MemberTier.SUPPORTER_PLUS -> Res.string.community_membership_tier_supporter_plus
    }
    Text(stringResource(label), color = textColor, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
}
