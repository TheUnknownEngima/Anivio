package com.nuvio.app.features.player

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.nuvio
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

@Composable
internal fun VideoEnhancementOptions(selected: VideoEnhancement, enabled: Boolean = true) {
    val colors = MaterialTheme.nuvio.colors
    Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(stringResource(Res.string.enhancement_description), style = MaterialTheme.typography.bodyMedium, color = colors.textSecondary)
        VideoEnhancement.entries.forEach { mode ->
            val checked = mode == selected
            Surface(
                shape = RoundedCornerShape(18.dp), color = if (checked) colors.accent.copy(alpha = 0.12f) else colors.surface,
                border = BorderStroke(1.dp, if (checked) colors.accent.copy(alpha = 0.45f) else colors.textSecondary.copy(alpha = 0.12f)),
            ) {
                Row(Modifier.fillMaxWidth().selectable(selected = checked, role = Role.RadioButton, enabled = enabled || mode == VideoEnhancement.Off,
                    onClick = { PlayerSettingsRepository.setVideoEnhancement(mode) })
                    .padding(horizontal = 12.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = checked, onClick = null, enabled = enabled || mode == VideoEnhancement.Off)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(stringResource(mode.label), style = MaterialTheme.typography.titleSmall, color = if (enabled || mode == VideoEnhancement.Off) colors.textPrimary else colors.textSecondary)
                        Text(stringResource(mode.description), style = MaterialTheme.typography.bodySmall, color = colors.textSecondary)
                    }
                }
            }
        }
        Text(stringResource(Res.string.enhancement_limits), style = MaterialTheme.typography.bodySmall, color = colors.textSecondary)
    }
}

@Composable
internal fun AndroidVideoSettingsModal(visible: Boolean, settings: PlayerSettingsUiState, available: Boolean, onDismiss: () -> Unit) {
    val status by VideoEnhancementRuntime.status.collectAsState()
    val colors = MaterialTheme.nuvio.colors
    PlayerSidePanel(visible = visible, onDismiss = onDismiss) {
        Column(Modifier.fillMaxSize().padding(24.dp)) {
            PlayerPanelHeader(title = stringResource(Res.string.enhancement_title)) {
                PlayerDialogButton(label = stringResource(Res.string.action_close), onClick = onDismiss)
            }
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Surface(shape = RoundedCornerShape(16.dp), color = colors.accent.copy(alpha = 0.10f)) {
                    Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.AutoAwesome, null, Modifier.size(20.dp), tint = colors.accent)
                        Text(stringResource(if (available) status.message else Res.string.enhancement_unavailable), style = MaterialTheme.typography.bodyMedium, color = colors.textPrimary)
                    }
                }
                VideoEnhancementOptions(settings.videoEnhancement, enabled = available)
            }
        }
    }
}
