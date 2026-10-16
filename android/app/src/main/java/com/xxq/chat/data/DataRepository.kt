package com.xxq.chat.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

interface DataRepository {
  val currentUser: StateFlow<User?>
  val whitelistStatus: StateFlow<WhitelistStatus>
  val conversations: StateFlow<List<Conversation>>
  val messages: StateFlow<Map<String, List<Message>>>
  val whitelistItems: StateFlow<List<WhitelistItem>>
  val auditLogs: StateFlow<List<AuditLog>>

  fun login(email: String, displayName: String, isAdmin: Boolean)
  fun logout()
  fun toggleWhitelistMode(enabled: Boolean)
  fun addWhitelist(email: String)
  fun removeWhitelist(email: String)
  fun sendMessage(conversationId: String, content: String)
}

class DefaultDataRepository : DataRepository {
  private val _currentUser = MutableStateFlow<User?>(
    User(
      id = "usr_alice",
      email = "alice@xxqchat.com",
      displayName = "Alice (Onaylı)",
      isAdmin = false
    )
  )
  override val currentUser = _currentUser.asStateFlow()

  private val _whitelistStatus = MutableStateFlow(
    WhitelistStatus(modeActive = true, isApproved = true, canAccessApp = true)
  )
  override val whitelistStatus = _whitelistStatus.asStateFlow()

  private val _conversations = MutableStateFlow<List<Conversation>>(
    listOf(
      Conversation(
        id = "conv_admin",
        type = "direct",
        name = "Sistem Yöneticisi",
        peer = User(
          id = "usr_admin",
          email = "admin@xxqchat.com",
          displayName = "Sistem Yöneticisi",
          isAdmin = true
        ),
        lastMessage = Message(
          id = "msg_1",
          conversationId = "conv_admin",
          senderId = "usr_admin",
          senderName = "Sistem Yöneticisi",
          content = "XXQ Chat Android uygulamasına hoş geldiniz! Beyaz liste güvenliği devrede.",
          status = "read",
          createdAt = "10:30"
        ),
        unreadCount = 0,
        updatedAt = "10:30"
      ),
      Conversation(
        id = "conv_general",
        type = "group",
        name = "XXQ Çekirdek Ekibi",
        lastMessage = Message(
          id = "msg_2",
          conversationId = "conv_general",
          senderId = "usr_bob",
          senderName = "Bob",
          content = "Android yerel Jetpack Compose derlemesi doğrulandı.",
          status = "delivered",
          createdAt = "Dün"
        ),
        unreadCount = 2,
        updatedAt = "Dün"
      )
    )
  )
  override val conversations = _conversations.asStateFlow()

  private val _messages = MutableStateFlow<Map<String, List<Message>>>(
    mapOf(
      "conv_admin" to listOf(
        Message(
          id = "m1",
          conversationId = "conv_admin",
          senderId = "usr_admin",
          senderName = "Sistem Yöneticisi",
          content = "Merhaba! Hesabınız doğrulandı ve beyaz listeye eklendi.",
          status = "read",
          createdAt = "10:28"
        ),
        Message(
          id = "m2",
          conversationId = "conv_admin",
          senderId = "usr_alice",
          senderName = "Alice (Onaylı)",
          content = "Teşekkürler! Gerçek zamanlı mesajlaşma son derece hızlı.",
          status = "read",
          createdAt = "10:29"
        ),
        Message(
          id = "m3",
          conversationId = "conv_admin",
          senderId = "usr_admin",
          senderName = "Sistem Yöneticisi",
          content = "XXQ Chat Android uygulamasına hoş geldiniz! Beyaz liste güvenliği devrede.",
          status = "read",
          createdAt = "10:30"
        )
      )
    )
  )
  override val messages = _messages.asStateFlow()

  private val _whitelistItems = MutableStateFlow<List<WhitelistItem>>(
    listOf(
      WhitelistItem("admin@xxqchat.com", "system_bootstrap", "2026-10-15 10:00"),
      WhitelistItem("alice@xxqchat.com", "admin@xxqchat.com", "2026-10-15 10:15")
    )
  )
  override val whitelistItems = _whitelistItems.asStateFlow()

  private val _auditLogs = MutableStateFlow<List<AuditLog>>(
    listOf(
      AuditLog("a1", "admin@xxqchat.com", "WHITELIST_ENABLED", "SYSTEM", "Beyaz liste erişim denetimi etkinleştirildi", "10:00:00"),
      AuditLog("a2", "admin@xxqchat.com", "USER_WHITELIST_APPROVED", "alice@xxqchat.com", "Hesap onaylandı", "10:15:20")
    )
  )
  override val auditLogs = _auditLogs.asStateFlow()

  override fun login(email: String, displayName: String, isAdmin: Boolean) {
    val isWhitelisted = _whitelistItems.value.any { it.email.equals(email, ignoreCase = true) } || isAdmin
    val canAccess = !_whitelistStatus.value.modeActive || isWhitelisted

    _currentUser.value = User(
      id = "usr_" + email.hashCode().toString(),
      email = email,
      displayName = displayName,
      isAdmin = isAdmin
    )

    _whitelistStatus.value = WhitelistStatus(
      modeActive = _whitelistStatus.value.modeActive,
      isApproved = isWhitelisted,
      canAccessApp = canAccess
    )
  }

  override fun logout() {
    _currentUser.value = null
  }

  override fun toggleWhitelistMode(enabled: Boolean) {
    _whitelistStatus.value = _whitelistStatus.value.copy(modeActive = enabled)
    val time = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
    val actor = _currentUser.value?.email ?: "admin"
    _auditLogs.value = listOf(
      AuditLog(
        id = "a_" + System.currentTimeMillis(),
        actorEmail = actor,
        action = if (enabled) "WHITELIST_ENABLED" else "WHITELIST_DISABLED",
        target = "SYSTEM",
        details = "Beyaz liste modu mobil yönetici tarafından değiştirildi",
        createdAt = time
      )
    ) + _auditLogs.value
  }

  override fun addWhitelist(email: String) {
    val time = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(Date())
    val actor = _currentUser.value?.email ?: "admin"
    _whitelistItems.value = _whitelistItems.value + WhitelistItem(email, actor, time)
    _auditLogs.value = listOf(
      AuditLog(
        id = "a_" + System.currentTimeMillis(),
        actorEmail = actor,
        action = "USER_WHITELIST_APPROVED",
        target = email,
        details = "Hesap mobil yönetici tarafından onaylandı",
        createdAt = time
      )
    ) + _auditLogs.value
  }

  override fun removeWhitelist(email: String) {
    _whitelistItems.value = _whitelistItems.value.filterNot { it.email.equals(email, ignoreCase = true) }
    val time = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
    val actor = _currentUser.value?.email ?: "admin"
    _auditLogs.value = listOf(
      AuditLog(
        id = "a_" + System.currentTimeMillis(),
        actorEmail = actor,
        action = "USER_WHITELIST_REVOKED",
        target = email,
        details = "Hesap mobil yönetici tarafından kaldırıldı",
        createdAt = time
      )
    ) + _auditLogs.value
  }

  override fun sendMessage(conversationId: String, content: String) {
    val user = _currentUser.value ?: return
    val time = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
    val newMsg = Message(
      id = "msg_" + System.currentTimeMillis(),
      conversationId = conversationId,
      senderId = user.id,
      senderName = user.displayName,
      content = content,
      status = "sent",
      createdAt = time
    )

    val currentList = _messages.value[conversationId] ?: emptyList()
    _messages.value = _messages.value + (conversationId to (currentList + newMsg))

    // Update conversation preview
    _conversations.value = _conversations.value.map {
      if (it.id == conversationId) {
        it.copy(lastMessage = newMsg, updatedAt = time)
      } else {
        it
      }
    }
  }
}
