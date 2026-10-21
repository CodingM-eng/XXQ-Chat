package com.xxq.chat.ui.main

import com.xxq.chat.data.DefaultDataRepository
import junit.framework.TestCase.assertEquals
import junit.framework.TestCase.assertTrue
import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Test

class MainScreenViewModelTest {
  @Test
  fun initialUser_isNullByDefault() = runTest {
    val repository = DefaultDataRepository()
    val viewModel = MainScreenViewModel(repository)
    val user = viewModel.currentUser.first()
    assertNull(user)

    val whitelistStatus = viewModel.whitelistStatus.first()
    assertTrue(whitelistStatus.modeActive)
    assertFalse(whitelistStatus.canAccessApp)
  }

  @Test
  fun approvedUser_canAccessApp() = runTest {
    val repository = DefaultDataRepository()
    val viewModel = MainScreenViewModel(repository)

    // Login with pre-approved email
    viewModel.login("onayli@xxqchat.com", "Onaylı Üye", false)

    val user = viewModel.currentUser.first()
    assertEquals("onayli@xxqchat.com", user?.email)
    assertEquals("approved", user?.status)

    val status = viewModel.whitelistStatus.first()
    assertTrue(status.isApproved)
    assertTrue(status.canAccessApp)
    assertEquals("approved", status.status)
  }

  @Test
  fun unapprovedUser_isBlockedWhenWhitelistActive() = runTest {
    val repository = DefaultDataRepository()
    val viewModel = MainScreenViewModel(repository)

    // Login with unapproved email
    viewModel.login("yeni.aday@external.org", "Yeni Aday", false)

    val user = viewModel.currentUser.first()
    assertEquals("yeni.aday@external.org", user?.email)
    assertEquals("pending", user?.status)

    val status = viewModel.whitelistStatus.first()
    assertTrue(status.modeActive)
    assertFalse(status.isApproved)
    assertFalse(status.canAccessApp)
    assertEquals("pending", status.status)
  }

  @Test
  fun rejectedUser_persistsRejectedStatus_andBlocksAccess() = runTest {
    val repository = DefaultDataRepository()
    val viewModel = MainScreenViewModel(repository)

    val rejectedEmail = "reddedilen@external.org"
    // Moderator rejects user
    viewModel.rejectUser(rejectedEmail)

    // User attempts to log in
    viewModel.login(rejectedEmail, "Reddedilen Kullanıcı", false)

    val user = viewModel.currentUser.first()
    assertEquals("rejected", user?.status)

    val status = viewModel.whitelistStatus.first()
    assertFalse(status.isApproved)
    assertFalse(status.canAccessApp)
    assertEquals("rejected", status.status)
  }

  @Test
  fun register_createsPendingAccessRequest_andAuditLog() = runTest {
    val repository = DefaultDataRepository()
    val viewModel = MainScreenViewModel(repository)

    viewModel.register("kayit@external.org", "Kayıt Adayı")

    val user = viewModel.currentUser.first()
    assertEquals("kayit@external.org", user?.email)
    assertEquals("Kayıt Adayı", user?.displayName)
    assertEquals("pending", user?.status)

    val logs = viewModel.auditLogs.first()
    assertTrue(logs.any { it.action == "USER_ACCESS_REQUESTED" && it.actorEmail == "kayit@external.org" })
  }

  @Test
  fun submitSupportMessage_recordsReportSuccessfully() = runTest {
    val repository = DefaultDataRepository()
    val viewModel = MainScreenViewModel(repository)

    viewModel.login("destek.isteyen@external.org", "Destek Arayan", false)

    val success = viewModel.submitSupportMessage("Onay süresi", "Erişim onayım ne zaman tamamlanır?")
    assertTrue(success)

    val reports = viewModel.supportReports.first()
    assertEquals(1, reports.size)
    assertEquals("Destek Arayan", reports[0].userDisplayName)
    assertEquals("Onay süresi", reports[0].title)
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

    viewModel.login("admin@xxqchat.com", "Sistem Yöneticisi", true)
    viewModel.sendMessage("conv_admin", "Testing Android message send")

    val msgs = viewModel.messages.first()["conv_admin"] ?: emptyList()
    assertTrue(msgs.any { it.content == "Testing Android message send" })

    val conv = viewModel.conversations.first().find { it.id == "conv_admin" }
    assertEquals("Testing Android message send", conv?.lastMessage?.content)
  }
}