package com.nuvio.app.features.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.features.player.VideoEnhancement
import com.nuvio.app.features.player.VideoEnhancementOptions
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun VideoEnhancementSettings(isTablet: Boolean, selected: VideoEnhancement, enabled: Boolean) {
    var show by remember { mutableStateOf(false) }
    SettingsSection(title = stringResource(Res.string.enhancement_title), isTablet = isTablet) {
        SettingsGroup(isTablet = isTablet) {
            SettingsNavigationRow(title = stringResource(Res.string.enhancement_mode),
                description = stringResource(if (enabled) selected.label else Res.string.enhancement_unavailable),
                isTablet = isTablet, enabled = enabled, onClick = { show = true })
        }
    }
    if (show) BasicAlertDialog(onDismissRequest = { show = false }) {
        Surface(shape = RoundedCornerShape(28.dp), color = MaterialTheme.nuvio.colors.background) {
            Column(Modifier.padding(20.dp).heightIn(max = 600.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(stringResource(Res.string.enhancement_title), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.nuvio.colors.textPrimary)
                Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
                    VideoEnhancementOptions(selected, enabled)
                }
                TextButton(onClick = { show = false }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(Res.string.action_close)) }
            }
        }
    }
}
