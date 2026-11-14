package com.nuvio.app.features.home.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.nuvio.app.core.anilist.stripAniListMarkup
import com.nuvio.app.core.i18n.localizedMediaTypeLabel
import com.nuvio.app.core.ui.posterCardClickable
import com.nuvio.app.features.home.MetaPreview
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

@Composable
internal fun HomeSpotlightCard(
    original: MetaPreview,
    onClick: ((MetaPreview) -> Unit)?,
    onLongClick: ((MetaPreview) -> Unit)?,
) {
    val item = rememberDiscoveryArtwork(original)
    val tint = discoveryArtworkTint(item)
    val backdrop = item.banner?.takeIf(String::isNotBlank)
    val shape = RoundedCornerShape(28.dp)
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val wide = maxWidth >= 600.dp
        val backdropHeight = (maxWidth * 0.62f).coerceIn(180.dp, 300.dp)
        val posterWidth = if (wide) 112.dp else 84.dp
        val posterHeight = if (wide) 164.dp else 124.dp
        Box(
            Modifier.fillMaxWidth().clip(shape).background(Color(0xFF101316))
                .posterCardClickable(onClick?.let { { it(item) } }, onLongClick?.let { { it(item) } },
                    zoomImageUrl = backdrop ?: item.poster, zoomCornerRadius = 28.dp)
                .border(1.dp, Color.White.copy(alpha = 0.12f), shape),
        ) {
            Box(Modifier.fillMaxWidth().height(backdropHeight).background(tint.copy(alpha = 0.14f))) {
                if (backdrop != null) {
                    AsyncImage(backdrop, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                } else {
                    // Keep portrait artwork portrait-shaped while a real landscape is unavailable.
                    AsyncImage(item.poster, null,
                        Modifier.align(Alignment.CenterEnd).width(backdropHeight * 0.72f).fillMaxHeight(), contentScale = ContentScale.Fit)
                }
                Box(Modifier.matchParentSize().background(Brush.verticalGradient(
                    0f to Color.Black.copy(alpha = 0.04f), 0.50f to Color.Black.copy(alpha = 0.10f),
                    1f to Color(0xFF101316),
                )))
            }
            Column(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Surface(shape = CircleShape, color = Color.Black.copy(alpha = 0.50f), border = BorderStroke(1.dp, Color.White.copy(alpha = 0.16f))) {
                        Row(Modifier.padding(horizontal = 11.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Icon(Icons.Rounded.AutoAwesome, null, Modifier.size(14.dp), tint = tint)
                            Text(stringResource(Res.string.home_spotlight_featured), style = MaterialTheme.typography.labelSmall, color = Color.White)
                        }
                    }
                }
                // The portrait crosses the artwork/panel seam; the logo gets its own bounded slot.
                Spacer(Modifier.height((backdropHeight - 108.dp).coerceAtLeast(48.dp)))
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                    verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    AsyncImage(item.poster, null,
                        Modifier.size(posterWidth, posterHeight).clip(RoundedCornerShape(14.dp))
                            .background(Color(0xFF1E2328))
                            .border(2.dp, Color.White.copy(alpha = 0.20f), RoundedCornerShape(14.dp)),
                        contentScale = ContentScale.Crop)
                    Column(Modifier.weight(1f).padding(bottom = 3.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        DiscoveryTitleLogo(item, maxHeight = if (wide) 112.dp else 90.dp)
                        val metadata = listOfNotNull(
                            item.releaseInfo?.takeIf { it.isNotBlank() && it.length <= 16 },
                            localizedMediaTypeLabel(item.type),
                            item.episodeDurationMinutes?.takeIf { it > 0 }?.let { stringResource(Res.string.home_discovery_minutes, it) },
                        ).joinToString(" · ")
                        Text(metadata, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.70f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
                Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    if (item.genres.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        item.genres.take(3).forEach { genre ->
                            Surface(shape = CircleShape, color = tint.copy(alpha = 0.09f), border = BorderStroke(1.dp, tint.copy(alpha = 0.18f))) {
                                Text(genre, Modifier.padding(horizontal = 10.dp, vertical = 6.dp), style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.86f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                    val synopsis = remember(item.description) { item.description?.stripAniListMarkup()?.replace(Regex("\\s+"), " ").orEmpty() }
                    if (synopsis.isNotBlank()) Text(synopsis, style = MaterialTheme.typography.bodyMedium, color = Color(0xFFC7CDD3), maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Surface(shape = CircleShape, color = Color.White.copy(alpha = 0.94f)) {
                        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 18.dp, vertical = 13.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(stringResource(Res.string.home_discovery_details), style = MaterialTheme.typography.labelLarge, color = Color(0xFF101316))
                            Icon(Icons.AutoMirrored.Rounded.ArrowForward, null, Modifier.size(20.dp), tint = Color(0xFF101316))
                        }
                    }
                }
            }
        }
    }
}
