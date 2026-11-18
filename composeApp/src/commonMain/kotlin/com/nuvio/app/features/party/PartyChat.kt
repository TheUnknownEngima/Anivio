package com.nuvio.app.features.party

import co.touchlab.kermit.Logger
import kotlinx.atomicfu.atomic
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import com.nuvio.app.core.sync.SyncClientIdentity
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlin.random.Random

enum class PartyChatStatus {
    Sent,
    Sending,
    Failed,
}

data class PartyChatMessage(
    val key: String,
    val id: Long?,
    val memberId: String,
    val name: String,
    val avatarUrl: String?,
    val avatarColor: String?,
    val body: String,
    val sentAt: Long,
    val mine: Boolean,
    val clientId: String? = null,
    val status: PartyChatStatus = PartyChatStatus.Sent,
)

internal data class PartyChatRoom(
    val partyId: String,
    val memberId: String,
    val members: List<PartyMember>,
    val startedAtMs: Long,
)

/** A room id can be reused. A local join token can never be reused. */
internal class PartyChatSessionGuard {
    private val generation = atomic(0L)
    fun start(): Long = generation.incrementAndGet()
    fun current(): Long = generation.value
    fun isCurrent(token: Long?): Boolean = token != null && token > 0 && token == generation.value
    fun stop(token: Long?): Boolean = token != null && token > 0 && generation.compareAndSet(token, token + 1)
}

internal fun currentSessionChat(room: PartyChatRoom, messages: List<PartyChatPayload>): List<PartyChatPayload> =
    messages.filter { it.sentAt >= room.startedAtMs }

internal fun PartyChatMessage.withCurrentPartyProfile(members: List<PartyMember>): PartyChatMessage {
    val member = members.firstOrNull { it.id == memberId } ?: return this
    return copy(name = member.displayName, avatarUrl = member.avatarUrl, avatarColor = member.avatarColor)
}

internal data class PartyChatMerge(
    val messages: List<PartyChatMessage>,
    val added: List<PartyChatMessage>,
)

@OptIn(ExperimentalCoroutinesApi::class)
object PartyChat {
    private val log = Logger.withTag("PartyChat")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default.limitedParallelism(1))
    private val syncLock = Mutex()

    private val _messages = MutableStateFlow<List<PartyChatMessage>>(emptyList())
    val messages: StateFlow<List<PartyChatMessage>> = _messages.asStateFlow()

    private val _unread = MutableStateFlow(0)
    val unread: StateFlow<Int> = _unread.asStateFlow()
    private val _activeSession = MutableStateFlow<Long?>(null)
    val activeSession: StateFlow<Long?> = _activeSession.asStateFlow()

    val draft = MutableStateFlow("")

    private val stateLock = SynchronizedObject()
    private val sessions = PartyChatSessionGuard()
    private var room: PartyChatRoom? = null
    private var roomToken = 0L
    private var refreshJob: Job? = null
    private val ownMemberIds = mutableSetOf<String>()
    private var loaded = false
    private var historyCursor: Long? = null
    private var open = false

    private fun activeRoom(token: Long): PartyChatRoom? = room.takeIf { roomToken == token && sessions.isCurrent(token) }

    fun setOpen(value: Boolean, token: Long? = _activeSession.value) {
        synchronized(stateLock) {
            if (token == null || activeRoom(token) == null) return
            open = value
            if (value) _unread.value = 0
        }
    }

    fun send(text: String) {
        val body = text.trim().take(MAX_LENGTH)
        if (body.isEmpty()) return
        val token = sessions.current()
        scope.launch {
            val pending = synchronized(stateLock) {
                val current = activeRoom(token) ?: return@launch
                val self = current.members.firstOrNull { it.id == current.memberId }
                val clientId = newClientId()
                val message = PartyChatMessage(
                    key = clientId, id = null, memberId = current.memberId,
                    name = self?.displayName.orEmpty(), avatarUrl = self?.avatarUrl,
                    avatarColor = self?.avatarColor, body = body, sentAt = PartyRepository.nowMs(),
                    mine = true, clientId = clientId, status = PartyChatStatus.Sending,
                )
                _messages.value = _messages.value + message
                current.partyId to message
            }
            deliver(token, pending.first, pending.second)
        }
    }

    fun retry(key: String) {
        val token = sessions.current()
        scope.launch {
            val pending = synchronized(stateLock) {
                val current = activeRoom(token) ?: return@launch
                val message = _messages.value.firstOrNull { it.key == key && it.status == PartyChatStatus.Failed } ?: return@launch
                _messages.value = _messages.value.map { if (it.key == key && it.id == null) it.copy(status = PartyChatStatus.Sending) else it }
                current.partyId to message
            }
            deliver(token, pending.first, pending.second)
        }
    }

    internal fun start(next: PartyChatRoom): Long = synchronized(stateLock) {
        val token = sessions.start()
        reset()
        room = next
        roomToken = token
        ownMemberIds += next.memberId
        _activeSession.value = token
        token
    }

    internal fun stop(token: Long?) = synchronized(stateLock) {
        if (sessions.stop(token)) reset()
    }

    internal fun refresh(token: Long?) {
        val request = token ?: return
        synchronized(stateLock) {
          if (activeRoom(request) == null || refreshJob?.isActive == true) return
          refreshJob = scope.launch {
            sync(request)
            val pending = synchronized(stateLock) {
                val current = activeRoom(request) ?: return@launch
                current.partyId to _messages.value.filter { it.status == PartyChatStatus.Failed }
            }
            pending.second.forEach { message ->
                setStatus(request, message.key, PartyChatStatus.Sending)
                deliver(request, pending.first, message)
            }
          }
        }
    }

    internal fun updateMembers(token: Long?, members: List<PartyMember>) = synchronized(stateLock) {
        if (token == null || activeRoom(token) == null) return@synchronized
        room = room?.copy(members = members)
        _messages.value = _messages.value.map { it.withCurrentPartyProfile(members) }
    }

    internal fun receive(token: Long?, payload: JsonObject) {
        if (!sessions.isCurrent(token)) return
        val request = token ?: return
        scope.launch {
            val message = runCatching { PartyApi.json.decodeFromJsonElement(PartyChatPayload.serializer(), payload) }
                .getOrNull() ?: return@launch
            apply(request, listOf(message), replaceOlder = false, notify = true)
        }
    }

    private suspend fun sync(token: Long) {
        syncLock.withLock {
            val request = synchronized(stateLock) {
                val current = activeRoom(token) ?: return
                current.partyId to if (loaded) historyCursor else null
            }
            val history = try {
                PartyApi.listMessages(request.first, SyncClientIdentity.currentClientId(), request.second)
            } catch (error: CancellationException) { throw error }
            catch (error: Throwable) { log.w(error) { "Chat history failed" }; return }
            val firstLoad = synchronized(stateLock) {
                if (activeRoom(token) == null || history.error != null) return
                val firstLoad = !loaded
                loaded = true
                historyCursor = maxOf(historyCursor ?: 0L, history.messages.maxOfOrNull { it.id } ?: 0L).takeIf { it > 0 }
                firstLoad
            }
            apply(token, history.messages, replaceOlder = request.second != null && history.messages.size >= HISTORY_LIMIT, notify = !firstLoad)
        }
    }

    private suspend fun deliver(token: Long, target: String, message: PartyChatMessage) {
        if (!sessions.isCurrent(token)) return
        val result = try {
            PartyApi.sendMessage(target, SyncClientIdentity.currentClientId(), message.body, message.key)
        } catch (error: CancellationException) { throw error }
        catch (error: Throwable) { log.w(error) { "Chat message failed" }; null }
        if (!sessions.isCurrent(token)) return
        val sent = result?.message
        if (sent == null) { setStatus(token, message.key, PartyChatStatus.Failed); return }
        PartyRepository.broadcastChat(sent, target, token)
        apply(token, listOf(sent), replaceOlder = false, notify = false)
    }

    private fun apply(token: Long, payloads: List<PartyChatPayload>, replaceOlder: Boolean, notify: Boolean) = synchronized(stateLock) {
        val current = activeRoom(token) ?: return@synchronized
        val result = mergePartyChat(
            current = _messages.value,
            incoming = currentSessionChat(current, payloads).map { it.toMessage().withCurrentPartyProfile(current.members) },
            replaceOlder = replaceOlder, limit = MESSAGE_LIMIT,
        )
        _messages.value = result.messages
        if (!notify || open) return@synchronized
        val fromOthers = result.added.filterNot { it.mine }
        if (fromOthers.isNotEmpty()) _unread.value += fromOthers.size
    }

    private fun setStatus(token: Long, key: String, status: PartyChatStatus) = synchronized(stateLock) {
        if (activeRoom(token) == null) return@synchronized
        _messages.value = _messages.value.map { if (it.key == key && it.id == null) it.copy(status = status) else it }
    }

    private fun reset() {
        refreshJob?.cancel()
        refreshJob = null
        room = null
        roomToken = 0L
        _activeSession.value = null
        ownMemberIds.clear()
        loaded = false
        historyCursor = null
        open = false
        draft.value = ""
        _messages.value = emptyList()
        _unread.value = 0
    }

    private fun PartyChatPayload.toMessage() = PartyChatMessage(
        key = "id:$id", id = id, memberId = memberId, name = name, avatarUrl = avatarUrl,
        avatarColor = avatarColor, body = body, sentAt = sentAt,
        mine = mine || memberId in ownMemberIds, clientId = clientId,
    )

    private fun newClientId(): String =
        buildString { repeat(CLIENT_ID_LENGTH) { append(CLIENT_ID_ALPHABET[Random.nextInt(CLIENT_ID_ALPHABET.length)]) } }

    const val MAX_LENGTH = 500
    private const val HISTORY_LIMIT = 100
    private const val MESSAGE_LIMIT = 200
    private const val CLIENT_ID_LENGTH = 20
    private const val CLIENT_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
}

internal fun mergePartyChat(
    current: List<PartyChatMessage>,
    incoming: List<PartyChatMessage>,
    replaceOlder: Boolean,
    limit: Int,
): PartyChatMerge {
    val oldestIncoming = incoming.mapNotNull { it.id }.minOrNull()
    val base = if (replaceOlder && oldestIncoming != null) {
        current.filter { it.id == null || it.id >= oldestIncoming }
    } else {
        current
    }
    val confirmed = base.filter { it.id != null }.associateByTo(mutableMapOf()) { it.id }
    val pending = base.filter { it.id == null }.toMutableList()
    val added = mutableListOf<PartyChatMessage>()
    incoming.sortedBy { it.id }.forEach { message ->
        val id = message.id ?: return@forEach
        if (id in confirmed) return@forEach
        val local = message.clientId
            ?.takeIf { message.mine }
            ?.let { clientId -> pending.firstOrNull { it.key == clientId } }
        if (local != null) {
            pending.remove(local)
            confirmed[id] = message.copy(key = local.key)
        } else {
            confirmed[id] = message
            added += message
        }
    }
    val merged = confirmed.values.sortedBy { it.id } + pending
    return PartyChatMerge(merged.takeLast(limit), added)
}
