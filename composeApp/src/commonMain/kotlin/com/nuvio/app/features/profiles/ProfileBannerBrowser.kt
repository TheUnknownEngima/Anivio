package com.nuvio.app.features.profiles

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil3.compose.AsyncImage
import com.nuvio.app.core.ui.NuvioPrimaryButton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

@Composable
internal fun ProfileBannerBrowser(
    selectedUrl: String?,
    overlayAlpha: Float,
    onPick: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var anime by remember { mutableStateOf<BannerAnime?>(null) }
    Dialog(
        onDismissRequest = { if (anime == null) onDismiss() else anime = null },
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier.padding(horizontal = 12.dp).widthIn(max = 840.dp)
                .fillMaxWidth().fillMaxHeight(0.96f).imePadding(),
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (anime != null) {
                        IconButton(onClick = { anime = null }) {
                            Icon(Icons.AutoMirrored.Rounded.ArrowBack, stringResource(Res.string.action_back))
                        }
                    }
                    Text(
                        text = stringResource(Res.string.profile_banner_browser),
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.weight(1f).padding(start = if (anime == null) 12.dp else 0.dp),
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Rounded.Close, stringResource(Res.string.action_close))
                    }
                }
                val title = anime
                BannerTitleBrowser(visible = title == null, onTitle = { anime = it })
                if (title != null) {
                    BannerArtworkBrowser(title, selectedUrl, overlayAlpha, onPick)
                }
            }
        }
    }
}

@Composable
private fun BannerTitleBrowser(visible: Boolean, onTitle: (BannerAnime) -> Unit) {
    var text by rememberSaveable { mutableStateOf("") }
    val query = text.trim()
    val gridState = rememberLazyGridState()
    val focus = LocalFocusManager.current
    var titles by remember(query) { mutableStateOf(emptyList<BannerAnime>()) }
    var page by remember(query) { mutableIntStateOf(1) }
    var hasMore by remember(query) { mutableStateOf(false) }
    var loading by remember(query) { mutableStateOf(true) }
    var failed by remember(query) { mutableStateOf(false) }
    var attempt by remember(query) { mutableIntStateOf(0) }

    LaunchedEffect(query, page, attempt) {
        loading = true
        failed = false
        if (page == 1 && query.isNotBlank() && attempt == 0) delay(400)
        try {
            val result = ProfileBannerCatalog.titles(query, page)
            titles = (if (page == 1) result.titles else titles + result.titles).distinctBy(BannerAnime::id)
            hasMore = result.hasMore
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            failed = true
        } finally {
            loading = false
        }
    }
    LaunchedEffect(query) { gridState.scrollToItem(0) }
    if (!visible) return
    OutlinedTextField(
        value = text,
        onValueChange = { text = it.take(120) },
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        singleLine = true,
        label = { Text(stringResource(Res.string.profile_banner_search)) },
        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
        trailingIcon = {
            if (text.isNotEmpty()) {
                IconButton(onClick = { text = "" }) {
                    Icon(Icons.Rounded.Close, stringResource(Res.string.profile_banner_clear_search))
                }
            }
        },
        shape = RoundedCornerShape(14.dp),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        keyboardActions = KeyboardActions(onSearch = { focus.clearFocus() }),
    )
    LazyVerticalGrid(
        columns = GridCells.Adaptive(148.dp),
        state = gridState,
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Text(
                stringResource(if (query.isBlank()) Res.string.profile_banner_popular else Res.string.profile_banner_results),
                style = MaterialTheme.typography.titleMedium,
            )
        }
        items(titles, key = BannerAnime::id) { title ->
            Surface(
                onClick = { focus.clearFocus(); onTitle(title) },
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.surfaceContainerHigh,
            ) {
                Column {
                    BannerPhoto(title.banner ?: title.poster, Modifier.fillMaxWidth().aspectRatio(16f / 9f))
                    Column(Modifier.padding(horizontal = 10.dp, vertical = 9.dp)) {
                        Text(title.title, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        title.year?.let { Text(it.toString(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            when {
                loading -> BannerProgress()
                failed -> BannerError { loading = true; attempt++ }
                titles.isEmpty() && !hasMore -> Text(stringResource(Res.string.profile_banner_no_titles))
                hasMore -> TextButton(onClick = { loading = true; page++ }) {
                    Text(stringResource(Res.string.profile_banner_more))
                }
            }
        }
    }
}

@Composable
private fun BannerArtworkBrowser(
    anime: BannerAnime,
    savedUrl: String?,
    overlayAlpha: Float,
    onPick: (String) -> Unit,
) {
    var choices by remember(anime.id) { mutableStateOf(profileBannerChoices(anime, null, emptyList())) }
    var selected by remember(anime.id) { mutableStateOf(savedUrl?.takeIf { it == anime.banner }) }
    var loading by remember(anime.id) { mutableStateOf(true) }
    var failed by remember(anime.id) { mutableStateOf(false) }
    var attempt by remember(anime.id) { mutableIntStateOf(0) }
    var previewFailed by remember(selected) { mutableStateOf(false) }
    // Keep the exact-title AniList image available while additional sources load.
    LaunchedEffect(anime.id, attempt) {
        loading = true
        failed = false
        try {
            choices = ProfileBannerCatalog.artwork(anime)
            if (selected == null && choices.any { it.url == savedUrl }) selected = savedUrl
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            failed = true
        } finally {
            loading = false
        }
    }
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val showPreview = maxHeight >= 360.dp
        Column(modifier = Modifier.fillMaxSize()) {
            Text(
                text = anime.title,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            val preview = selected
            if (preview != null && showPreview) {
                Box(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)
                        .height(126.dp).clip(RoundedCornerShape(14.dp)),
                ) {
                    BannerPhoto(preview, Modifier.fillMaxSize(), onError = { previewFailed = true })
                    Box(
                        Modifier.fillMaxSize().background(
                            Brush.verticalGradient(listOf(Color.Black.copy(alpha = overlayAlpha), Color.Black.copy(alpha = 0.76f))),
                        ),
                    )
                    Text(
                        stringResource(if (previewFailed) Res.string.profile_banner_image_failed else Res.string.profile_banner_preview),
                        modifier = Modifier.align(Alignment.BottomStart).padding(12.dp),
                        style = MaterialTheme.typography.labelMedium,
                        color = Color.White,
                    )
                }
            }
            LazyVerticalGrid(
                columns = GridCells.Adaptive(148.dp),
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                items(choices, key = ProfileBanner::url) { banner ->
                    val active = selected == banner.url
                    val shape = RoundedCornerShape(12.dp)
                    Column(Modifier.clip(shape).selectable(selected = active, onClick = { selected = banner.url })) {
                        Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(shape)) {
                            val thumbnail = if (banner.source == ProfileBannerSource.Tmdb) {
                                banner.url.replace("/t/p/w1280/", "/t/p/w780/")
                            } else banner.url
                            BannerPhoto(thumbnail, Modifier.fillMaxSize())
                            if (active) {
                                Box(Modifier.fillMaxSize().border(2.dp, MaterialTheme.colorScheme.primary, shape))
                                Icon(
                                    Icons.Rounded.Check,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onPrimary,
                                    modifier = Modifier.align(Alignment.TopEnd).padding(5.dp)
                                        .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(50)).padding(3.dp),
                                )
                            }
                        }
                        Text(banner.label(), Modifier.padding(8.dp), style = MaterialTheme.typography.labelMedium)
                    }
                }
                item(span = { GridItemSpan(maxLineSpan) }) {
                    when {
                        loading -> BannerProgress()
                        failed -> BannerError { loading = true; attempt++ }
                        choices.isEmpty() -> Text(stringResource(Res.string.profile_banner_no_images))
                    }
                }
            }
            if (preview != null) {
                NuvioPrimaryButton(
                    text = stringResource(Res.string.profile_banner_use),
                    onClick = { onPick(preview) },
                    enabled = !previewFailed,
                    modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
                )
            }
        }
    }
}

@Composable
private fun ProfileBanner.label(): String = when (source) {
    ProfileBannerSource.AniList -> stringResource(Res.string.profile_banner_anilist)
    ProfileBannerSource.Tmdb -> stringResource(Res.string.profile_banner_tmdb)
    ProfileBannerSource.MappedArtwork -> stringResource(Res.string.profile_banner_mapped)
    ProfileBannerSource.Episode -> stringResource(Res.string.profile_banner_episode, episode ?: 1)
}

@Composable
private fun BannerPhoto(url: String?, modifier: Modifier = Modifier, onError: () -> Unit = {}) {
    var failed by remember(url) { mutableStateOf(false) }
    Box(modifier.background(MaterialTheme.colorScheme.surfaceContainerHighest), contentAlignment = Alignment.Center) {
        if (url == null || failed) {
            Icon(Icons.Rounded.Image, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            AsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
                onError = { failed = true; onError() },
            )
        }
    }
}

@Composable
private fun BannerProgress() {
    Box(Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}

@Composable
private fun BannerError(retry: () -> Unit) {
    Column {
        Text(stringResource(Res.string.profile_banner_load_failed), color = MaterialTheme.colorScheme.onSurfaceVariant)
        TextButton(onClick = retry) { Text(stringResource(Res.string.profile_banner_retry)) }
    }
}
