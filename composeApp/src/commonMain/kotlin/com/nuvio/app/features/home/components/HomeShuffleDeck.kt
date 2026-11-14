package com.nuvio.app.features.home.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.nuvio.app.core.anilist.stripAniListMarkup
import com.nuvio.app.core.i18n.localizedMediaTypeLabel
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.core.ui.parseHexColor
import com.nuvio.app.core.ui.posterCardClickable
import com.nuvio.app.features.home.MetaPreview
import com.nuvio.app.features.home.stableKey
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource
import kotlin.math.roundToInt
import kotlin.random.Random

@Composable
internal fun HomeShuffleDeck(
    title: String,
    items: List<MetaPreview>,
    onClick: ((MetaPreview) -> Unit)?,
    onLongClick: ((MetaPreview) -> Unit)?,
) {
    if (items.size < 2) return
    val colors = MaterialTheme.nuvio.colors
    var selected by rememberSaveable(items.map { it.stableKey() }) { mutableIntStateOf(0) }
    var turns by remember { mutableIntStateOf(0) }
    val index = selected.mod(items.size)
    val rotation by animateFloatAsState(turns * 180f, tween(380, easing = FastOutSlowInEasing), label = "shuffle_button_turn")
    val tint = discoveryArtworkTint(items[index])

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, style = MaterialTheme.typography.titleLarge, color = colors.textPrimary)
                Text(stringResource(Res.string.home_discovery_shuffle_hint), style = MaterialTheme.typography.bodySmall,
                    color = colors.textSecondary, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            FilledTonalButton(
                onClick = { selected = (index + Random.nextInt(1, items.size)) % items.size; turns++ },
                modifier = Modifier.heightIn(min = 48.dp),
                colors = ButtonDefaults.filledTonalButtonColors(containerColor = colors.surfaceElevated, contentColor = colors.textPrimary),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
            ) {
                Icon(Icons.Rounded.Shuffle, null, Modifier.size(18.dp).graphicsLayer { rotationZ = rotation })
                Spacer(Modifier.width(7.dp))
                Text(stringResource(Res.string.home_discovery_shuffle_action), style = MaterialTheme.typography.labelLarge)
            }
        }
        BoxWithConstraints(
            Modifier.align(Alignment.CenterHorizontally).widthIn(max = 480.dp).fillMaxWidth().padding(vertical = 6.dp),
        ) {
            val compact = maxWidth < 330.dp
            val cardHeight = if (compact) 390.dp else 410.dp
            Box(Modifier.fillMaxWidth().height(cardHeight + 34.dp), contentAlignment = Alignment.TopCenter) {
                Box(Modifier.matchParentSize().background(Brush.radialGradient(listOf(tint.copy(alpha = 0.20f), Color.Transparent))))
                for (depth in minOf(2, items.lastIndex) downTo 1) {
                    val item = items[(index + depth) % items.size]
                    Box(
                        Modifier.padding(horizontal = 12.dp).fillMaxWidth().height(cardHeight)
                            .graphicsLayer {
                                rotationZ = if (depth == 2) -5.5f else 4.5f
                                scaleX = 1f - depth * 0.025f
                                translationX = (if (depth == 2) -5 else 5).dp.toPx()
                                translationY = (depth * 11).dp.toPx()
                            }
                            .clip(RoundedCornerShape(28.dp)).background(colors.surfaceElevated)
                            .border(1.dp, Color.White.copy(alpha = 0.16f), RoundedCornerShape(28.dp)),
                    ) {
                        AsyncImage(item.poster ?: item.banner, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                        Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = 0.20f)))
                    }
                }
                AnimatedContent(
                    targetState = items[index],
                    modifier = Modifier.padding(horizontal = 12.dp),
                    transitionSpec = {
                        (fadeIn(tween(260)) + slideInHorizontally(tween(320, easing = FastOutSlowInEasing)) { it / 7 } + scaleIn(tween(320), initialScale = 0.96f)) togetherWith
                            (fadeOut(tween(170)) + slideOutHorizontally(tween(260)) { -it / 8 } + scaleOut(tween(260), targetScale = 0.96f))
                    },
                    label = "home_shuffle_card_deal",
                ) { item ->
                    ShuffleFeatureCard(rememberDiscoveryArtwork(item), compact, Modifier.fillMaxWidth().height(cardHeight), onClick, onLongClick)
                }
            }
        }
    }
}

@Composable
internal fun discoveryArtworkTint(item: MetaPreview): Color {
    val fallback = MaterialTheme.nuvio.colors.accent
    val color = remember(item.artworkColor, fallback) { item.artworkColor?.let(::parseHexColor)?.let { Color(it) } ?: fallback }
    return if (color.luminance() < 0.18f) lerp(color, Color.White, 0.38f) else color
}

@Composable
private fun ShuffleFeatureCard(
    item: MetaPreview,
    compact: Boolean,
    modifier: Modifier,
    onClick: ((MetaPreview) -> Unit)?,
    onLongClick: ((MetaPreview) -> Unit)?,
) {
    val tint = discoveryArtworkTint(item)
    val shape = RoundedCornerShape(28.dp)
    val image = item.banner?.takeIf(String::isNotBlank) ?: item.poster
    Box(
        modifier.clip(shape).background(Color(0xFF111316))
            .posterCardClickable(onClick?.let { { it(item) } }, onLongClick?.let { { it(item) } }, zoomImageUrl = image, zoomCornerRadius = 28.dp)
            .border(1.dp, Color.White.copy(alpha = 0.20f), shape),
    ) {
        AsyncImage(image, null, Modifier.matchParentSize(), contentScale = ContentScale.Crop)
        Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = 0.12f)))
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(
            0f to Color.Black.copy(alpha = 0.10f), 0.22f to Color.Black.copy(alpha = 0.20f),
            0.40f to Color.Black.copy(alpha = 0.82f), 1f to Color(0xFF0C0F13),
        )))
        Box(Modifier.matchParentSize().background(Brush.radialGradient(listOf(tint.copy(alpha = 0.12f), Color.Transparent))))
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = CircleShape, color = Color.Black.copy(alpha = 0.46f), border = BorderStroke(1.dp, Color.White.copy(alpha = 0.18f))) {
                Row(Modifier.padding(horizontal = 10.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Rounded.AutoAwesome, null, Modifier.size(14.dp), tint = tint)
                    Text(stringResource(Res.string.home_discovery_pick_badge), style = MaterialTheme.typography.labelSmall, color = Color.White)
                }
            }
            val score = item.imdbRating?.toDoubleOrNull()?.takeIf { it.isFinite() && it > 0.0 && it <= 10.0 }
            if (score != null) Surface(shape = CircleShape, color = Color.Black.copy(alpha = 0.46f)) {
                Row(Modifier.padding(horizontal = 9.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(Icons.Rounded.Star, stringResource(Res.string.home_discovery_catalog_score), Modifier.size(14.dp), tint = Color(0xFFFFD27A))
                    Text(((score * 10).roundToInt() / 10.0).toString(), style = MaterialTheme.typography.labelMedium, color = Color.White)
                }
            }
        }
        Column(Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.Bottom) {
                AsyncImage(
                    item.poster ?: item.banner, null,
                    Modifier.size(width = if (compact) 68.dp else 82.dp, height = if (compact) 102.dp else 122.dp)
                        .clip(RoundedCornerShape(12.dp)).background(tint.copy(alpha = 0.18f))
                        .border(1.dp, Color.White.copy(alpha = 0.24f), RoundedCornerShape(12.dp)),
                    contentScale = ContentScale.Crop,
                )
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    DiscoveryTitleLogo(item, maxHeight = if (compact) 80.dp else 92.dp)
                    val metadata = listOfNotNull(
                        item.releaseInfo?.takeIf { it.isNotBlank() && it.length <= 16 },
                        localizedMediaTypeLabel(item.type),
                        item.episodeDurationMinutes?.takeIf { it > 0 }?.let { stringResource(Res.string.home_discovery_minutes, it) },
                    ).joinToString(" · ")
                    Text(metadata, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.72f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        item.genres.take(2).forEach { genre ->
                            Surface(shape = CircleShape, color = Color.White.copy(alpha = 0.10f), border = BorderStroke(1.dp, Color.White.copy(alpha = 0.12f))) {
                                Text(genre, Modifier.padding(horizontal = 8.dp, vertical = 4.dp), style = MaterialTheme.typography.labelSmall,
                                    color = Color.White.copy(alpha = 0.88f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            }
            val description = remember(item.description) { item.description?.stripAniListMarkup()?.replace(Regex("\\s+"), " ").orEmpty() }
            if (description.isNotBlank()) Text(description, style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.72f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            Surface(shape = CircleShape, color = Color.White.copy(alpha = 0.94f)) {
                Row(Modifier.fillMaxWidth().heightIn(min = 46.dp).padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(stringResource(Res.string.home_discovery_details), style = MaterialTheme.typography.labelLarge, color = Color(0xFF101214))
                    Icon(Icons.AutoMirrored.Rounded.ArrowForward, null, Modifier.size(19.dp), tint = Color(0xFF101214))
                }
            }
        }
    }
}
