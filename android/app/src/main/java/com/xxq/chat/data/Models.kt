package com.xxq.chat.data

import kotlinx.serialization.Serializable

@Serializable
data class User(
  val id: String,
  val email: String,
  val displayName: String,
  val avatarUrl: String? = null,
  val isAdmin: Boolean = false,
  val lastActiveAt: String? = null
)

@Serializable
data class WhitelistStatus(
  val modeActive: Boolean,
  val isApproved: Boolean,
  val canAccessApp: Boolean
)

@Serializable
data class Message(
  val id: String,
  val conversationId: String,
  val senderId: String,
  val senderName: String,
  val content: String,
  val status: String,
  val createdAt: String
)

@Serializable
data class Conversation(
  val id: String,
  val type: String,
  val name: String,
  val peer: User? = null,
  val lastMessage: Message? = null,
  val unreadCount: Int = 0,
  val updatedAt: String
)

@Serializable
data class WhitelistItem(
  val email: String,
  val approvedBy: String,
  val createdAt: String
)

@Serializable
data class AuditLog(
  val id: String,
  val actorEmail: String,
  val action: String,
  val target: String? = null,
  val details: String? = null,
  val createdAt: String
)
