package com.xxq.chat.ui.main

import androidx.lifecycle.ViewModel
import com.xxq.chat.data.*
import kotlinx.coroutines.flow.StateFlow

class MainScreenViewModel(private val repository: DataRepository) : ViewModel() {
  val currentUser: StateFlow<User?> = repository.currentUser
  val whitelistStatus: StateFlow<WhitelistStatus> = repository.whitelistStatus
  val conversations: StateFlow<List<Conversation>> = repository.conversations
  val messages: StateFlow<Map<String, List<Message>>> = repository.messages
  val whitelistItems: StateFlow<List<WhitelistItem>> = repository.whitelistItems
  val auditLogs: StateFlow<List<AuditLog>> = repository.auditLogs

  fun login(email: String, displayName: String, isAdmin: Boolean) {
    repository.login(email, displayName, isAdmin)
  }

  fun logout() {
    repository.logout()
  }

  fun toggleWhitelistMode(enabled: Boolean) {
    repository.toggleWhitelistMode(enabled)
  }

  fun addWhitelist(email: String) {
    repository.addWhitelist(email)
  }

  fun removeWhitelist(email: String) {
    repository.removeWhitelist(email)
  }

  fun sendMessage(conversationId: String, content: String) {
    repository.sendMessage(conversationId, content)
  }
}
