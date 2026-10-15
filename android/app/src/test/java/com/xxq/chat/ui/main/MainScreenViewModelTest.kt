package com.xxq.chat.ui.main

import com.xxq.chat.data.DefaultDataRepository
import junit.framework.TestCase.assertEquals
import junit.framework.TestCase.assertTrue
import junit.framework.TestCase.assertFalse
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Test

class MainScreenViewModelTest {
  @Test
  fun initialUser_isLoadedSuccessfully() = runTest {
    val repository = DefaultDataRepository()
    val viewModel = MainScreenViewModel(repository)
    val user = viewModel.currentUser.first()
    assertEquals("usr_alice", user?.id)
    assertEquals("alice@xxqchat.com", user?.email)
  }

  @Test
  fun whitelistMode_toggle_updatesStateAndAuditLog() = runTest {
    val repository = DefaultDataRepository()
    val viewModel = MainScreenViewModel(repository)

    assertTrue(viewModel.whitelistStatus.first().modeActive)

    viewModel.toggleWhitelistMode(false)
    assertFalse(viewModel.whitelistStatus.first().modeActive)

    val auditLogs = viewModel.auditLogs.first()
    assertTrue(auditLogs.any { it.action == "WHITELIST_DISABLED" })
  }

  @Test
  fun sendMessage_updatesMessagesAndConversation() = runTest {
    val repository = DefaultDataRepository()
    val viewModel = MainScreenViewModel(repository)

    viewModel.sendMessage("conv_admin", "Testing Android message send")

    val msgs = viewModel.messages.first()["conv_admin"] ?: emptyList()
    assertTrue(msgs.any { it.content == "Testing Android message send" })

    val conv = viewModel.conversations.first().find { it.id == "conv_admin" }
    assertEquals("Testing Android message send", conv?.lastMessage?.content)
  }

  @Test
  fun unapprovedUser_isBlockedWhenWhitelistActive() = runTest {
    val repository = DefaultDataRepository()
    val viewModel = MainScreenViewModel(repository)

    // Login as unapproved eve
    viewModel.login("eve@outsider.com", "Eve Blocked", false)

    val status = viewModel.whitelistStatus.first()
    assertTrue(status.modeActive)
    assertFalse(status.isApproved)
    assertFalse(status.canAccessApp)
  }
}
