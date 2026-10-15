package com.xxq.chat.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation3.runtime.NavKey
import com.xxq.chat.data.*
import com.xxq.chat.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
  onItemClick: (NavKey) -> Unit,
  modifier: Modifier = Modifier,
  viewModel: MainScreenViewModel = viewModel { MainScreenViewModel(DefaultDataRepository()) },
) {
  val currentUser by viewModel.currentUser.collectAsStateWithLifecycle()
  val whitelistStatus by viewModel.whitelistStatus.collectAsStateWithLifecycle()
  val conversations by viewModel.conversations.collectAsStateWithLifecycle()
  val messagesMap by viewModel.messages.collectAsStateWithLifecycle()
  val whitelistItems by viewModel.whitelistItems.collectAsStateWithLifecycle()
  val auditLogs by viewModel.auditLogs.collectAsStateWithLifecycle()

  var selectedConvId by remember { mutableStateOf<String?>(null) }
  var showAdminView by remember { mutableStateOf(false) }
  var showLoginDialog by remember { mutableStateOf(false) }
  var showNewChatDialog by remember { mutableStateOf(false) }

  // 1. If Whitelist is Active and user is not approved
  if (currentUser != null && whitelistStatus.modeActive && !whitelistStatus.isApproved) {
    Scaffold(
      topBar = {
        TopAppBar(
          title = { Text("XXQ Chat", fontWeight = FontWeight.Bold) },
          colors = TopAppBarDefaults.topAppBarColors(containerColor = XXQDarkBg, titleContentColor = Color.White)
        )
      },
      containerColor = XXQDarkBg
    ) { padding ->
      Column(
        modifier = Modifier
          .fillMaxSize()
          .padding(padding)
          .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
      ) {
        Text("🔒", fontSize = 56.sp)
        Spacer(Modifier.height(16.dp))
        Text("Access Restricted", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Spacer(Modifier.height(8.dp))
        Text(
          "XXQ Chat is currently operating in Whitelist Mode. Your account (${currentUser?.email}) has not been approved.",
          fontSize = 13.sp,
          color = XXQTextMuted,
          modifier = Modifier.padding(horizontal = 16.dp)
        )
        Spacer(Modifier.height(24.dp))
        Button(
          onClick = { showLoginDialog = true },
          colors = ButtonDefaults.buttonColors(containerColor = XXQSapphire)
        ) {
          Text("Switch Account / Persona")
        }
      }
    }
    return
  }

  // 2. Admin View
  if (showAdminView) {
    Scaffold(
      topBar = {
        TopAppBar(
          title = { Text("Security Administration", fontWeight = FontWeight.Bold, fontSize = 18.sp) },
          navigationIcon = {
            IconButton(onClick = { showAdminView = false }) {
              Text("←", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            }
          },
          colors = TopAppBarDefaults.topAppBarColors(containerColor = XXQDarkBg, titleContentColor = Color.White)
        )
      },
      containerColor = XXQDarkBg
    ) { padding ->
      LazyColumn(
        modifier = Modifier
          .fillMaxSize()
          .padding(padding)
          .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
      ) {
        // Whitelist Toggle Card
        item {
          Card(
            colors = CardDefaults.cardColors(containerColor = XXQCardBg),
            shape = RoundedCornerShape(16.dp)
          ) {
            Column(modifier = Modifier.padding(16.dp)) {
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
              ) {
                Column {
                  Text("Whitelist Access Control", fontWeight = FontWeight.Bold, color = Color.White)
                  Text(
                    if (whitelistStatus.modeActive) "Mode: ON (Strict Approval)" else "Mode: OFF (Open Access)",
                    fontSize = 12.sp,
                    color = if (whitelistStatus.modeActive) XXQSky else XXQSuccess
                  )
                }
                Switch(
                  checked = whitelistStatus.modeActive,
                  onCheckedChange = { viewModel.toggleWhitelistMode(it) }
                )
              }
            }
          }
        }

        // Whitelist Directory Section
        item {
          Text("Approved Whitelist Directory", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color.White)
        }

        items(whitelistItems) { item ->
          Card(
            colors = CardDefaults.cardColors(containerColor = XXQCardBg),
            shape = RoundedCornerShape(12.dp)
          ) {
            Row(
              modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically
            ) {
              Column {
                Text(item.email, fontWeight = FontWeight.SemiBold, color = Color.White)
                Text("Approved by: ${item.approvedBy}", fontSize = 11.sp, color = XXQTextMuted)
              }
              IconButton(onClick = { viewModel.removeWhitelist(item.email) }) {
                Text("✕", color = Color(0xFFF87171), fontSize = 16.sp, fontWeight = FontWeight.Bold)
              }
            }
          }
        }

        // Audit Logs Section
        item {
          Spacer(Modifier.height(8.dp))
          Text("Security Audit Logs", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color.White)
        }

        items(auditLogs) { log ->
          Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFF131D31)),
            shape = RoundedCornerShape(10.dp)
          ) {
            Column(modifier = Modifier.padding(10.dp)) {
              Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(log.action, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = XXQSky)
                Text(log.createdAt, fontSize = 11.sp, color = XXQTextMuted)
              }
              Text("Actor: ${log.actorEmail}", fontSize = 11.sp, color = Color.White)
              if (log.target != null) {
                Text("Target: ${log.target}", fontSize = 11.sp, color = XXQTextMuted)
              }
            }
          }
        }
      }
    }
    return
  }

  // 3. Direct Chat View
  if (selectedConvId != null) {
    val activeConv = conversations.find { it.id == selectedConvId }
    val convMessages = messagesMap[selectedConvId] ?: emptyList()
    var inputText by remember { mutableStateOf("") }

    Scaffold(
      topBar = {
        TopAppBar(
          title = {
            Column {
              Text(activeConv?.name ?: "Chat", fontWeight = FontWeight.Bold, fontSize = 16.sp)
              Text("online", fontSize = 11.sp, color = XXQSuccess)
            }
          },
          navigationIcon = {
            IconButton(onClick = { selectedConvId = null }) {
              Text("←", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            }
          },
          colors = TopAppBarDefaults.topAppBarColors(containerColor = XXQDarkBg, titleContentColor = Color.White)
        )
      },
      bottomBar = {
        Surface(
          color = XXQDarkBg,
          modifier = Modifier
            .fillMaxWidth()
            .imePadding()
        ) {
          Row(
            modifier = Modifier
              .padding(8.dp)
              .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
          ) {
            TextField(
              value = inputText,
              onValueChange = { inputText = it },
              placeholder = { Text("Write a message...", color = XXQTextMuted, fontSize = 14.sp) },
              modifier = Modifier
                .weight(1f)
                .background(XXQCardBg, RoundedCornerShape(24.dp)),
              colors = TextFieldDefaults.colors(
                focusedContainerColor = XXQCardBg,
                unfocusedContainerColor = XXQCardBg,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White
              ),
              shape = RoundedCornerShape(24.dp)
            )
            Spacer(Modifier.width(8.dp))
            IconButton(
              onClick = {
                if (inputText.isNotBlank()) {
                  viewModel.sendMessage(selectedConvId!!, inputText.trim())
                  inputText = ""
                }
              },
              modifier = Modifier
                .size(48.dp)
                .background(XXQSapphire, CircleShape)
            ) {
              Text("➤", color = Color.White, fontSize = 16.sp)
            }
          }
        }
      },
      containerColor = XXQDarkBg
    ) { padding ->
      LazyColumn(
        modifier = Modifier
          .fillMaxSize()
          .padding(padding)
          .padding(horizontal = 12.dp),
        reverseLayout = false
      ) {
        items(convMessages) { msg ->
          val isMe = msg.senderId == currentUser?.id
          Box(
            modifier = Modifier
              .fillMaxWidth()
              .padding(vertical = 4.dp),
            contentAlignment = if (isMe) Alignment.CenterEnd else Alignment.CenterStart
          ) {
            Column(
              modifier = Modifier
                .widthIn(max = 280.dp)
                .clip(
                  RoundedCornerShape(
                    topStart = 16.dp,
                    topEnd = 16.dp,
                    bottomStart = if (isMe) 16.dp else 4.dp,
                    bottomEnd = if (isMe) 4.dp else 16.dp
                  )
                )
                .background(if (isMe) XXQBubbleOut else XXQBubbleIn)
                .padding(12.dp)
            ) {
              if (!isMe) {
                Text(msg.senderName, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = XXQSky)
              }
              Text(msg.content, color = Color.White, fontSize = 14.sp)
              Row(
                modifier = Modifier.align(Alignment.End),
                verticalAlignment = Alignment.CenterVertically
              ) {
                Text(msg.createdAt, fontSize = 10.sp, color = if (isMe) Color(0xFFBFDBFE) else XXQTextMuted)
                if (isMe) {
                  Spacer(Modifier.width(4.dp))
                  Text(if (msg.status == "read") "✓✓" else "✓", fontSize = 10.sp, color = if (msg.status == "read") XXQSky else Color(0xFFBFDBFE))
                }
              }
            }
          }
        }
      }
    }
    return
  }

  // 4. Default Conversation List View
  Scaffold(
    topBar = {
      TopAppBar(
        title = {
          Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
              modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(XXQSapphire),
              contentAlignment = Alignment.Center
            ) {
              Text("Q", fontWeight = FontWeight.ExtraBold, color = Color.White, fontSize = 18.sp)
            }
            Spacer(Modifier.width(10.dp))
            Column {
              Text("XXQ Chat", fontWeight = FontWeight.Bold, fontSize = 18.sp)
              Text("Live Gateway", fontSize = 10.sp, color = XXQSuccess)
            }
          }
        },
        actions = {
          if (currentUser?.isAdmin == true) {
            IconButton(onClick = { showAdminView = true }) {
              Text("🛡", fontSize = 18.sp)
            }
          }
          IconButton(onClick = { showLoginDialog = true }) {
            Text("👤", fontSize = 18.sp)
          }
        },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = XXQDarkBg, titleContentColor = Color.White)
      )
    },
    floatingActionButton = {
      FloatingActionButton(
        onClick = { showNewChatDialog = true },
        containerColor = XXQSapphire,
        contentColor = Color.White
      ) {
        Text("+", fontSize = 24.sp, fontWeight = FontWeight.Bold)
      }
    },
    containerColor = XXQDarkBg
  ) { padding ->
    LazyColumn(
      modifier = Modifier
        .fillMaxSize()
        .padding(padding)
    ) {
      items(conversations) { conv ->
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .clickable { selectedConvId = conv.id }
            .padding(horizontal = 16.dp, vertical = 12.dp),
          verticalAlignment = Alignment.CenterVertically
        ) {
          Box(
            modifier = Modifier
              .size(48.dp)
              .clip(CircleShape)
              .background(XXQSapphire),
            contentAlignment = Alignment.Center
          ) {
            Text(conv.name.take(2).uppercase(), fontWeight = FontWeight.Bold, color = Color.White)
          }

          Spacer(Modifier.width(12.dp))

          Column(modifier = Modifier.weight(1f)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
              Text(conv.name, fontWeight = FontWeight.SemiBold, color = Color.White, fontSize = 15.sp)
              Text(conv.updatedAt, fontSize = 11.sp, color = XXQTextMuted)
            }
            Spacer(Modifier.height(2.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
              Text(
                conv.lastMessage?.content ?: "No messages yet",
                fontSize = 13.sp,
                color = XXQTextMuted,
                maxLines = 1
              )
              if (conv.unreadCount > 0) {
                Box(
                  modifier = Modifier
                    .clip(CircleShape)
                    .background(XXQSapphire)
                    .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                  Text(conv.unreadCount.toString(), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White)
                }
              }
            }
          }
        }
        HorizontalDivider(color = XXQBorder, thickness = 0.5.dp, modifier = Modifier.padding(start = 76.dp))
      }
    }
  }

  // Persona Switcher Dialog
  if (showLoginDialog) {
    AlertDialog(
      onDismissRequest = { showLoginDialog = false },
      title = { Text("Switch Persona / Account", fontWeight = FontWeight.Bold) },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Button(
            onClick = {
              viewModel.login("admin@xxqchat.com", "System Admin", true)
              showLoginDialog = false
            },
            colors = ButtonDefaults.buttonColors(containerColor = XXQCardBg),
            modifier = Modifier.fillMaxWidth()
          ) {
            Text("Admin (admin@xxqchat.com)", color = XXQSky)
          }
          Button(
            onClick = {
              viewModel.login("alice@xxqchat.com", "Alice Approved", false)
              showLoginDialog = false
            },
            colors = ButtonDefaults.buttonColors(containerColor = XXQCardBg),
            modifier = Modifier.fillMaxWidth()
          ) {
            Text("Alice (Whitelisted Member)", color = XXQSuccess)
          }
          Button(
            onClick = {
              viewModel.login("eve@outsider.com", "Eve Blocked", false)
              showLoginDialog = false
            },
            colors = ButtonDefaults.buttonColors(containerColor = XXQCardBg),
            modifier = Modifier.fillMaxWidth()
          ) {
            Text("Eve (Unapproved Outsider)", color = Color(0xFFF87171))
          }
        }
      },
      confirmButton = {},
      dismissButton = {
        TextButton(onClick = { showLoginDialog = false }) { Text("Cancel") }
      },
      containerColor = XXQDarkBg,
      titleContentColor = Color.White
    )
  }

  // New Chat Dialog
  if (showNewChatDialog) {
    AlertDialog(
      onDismissRequest = { showNewChatDialog = false },
      title = { Text("Start Direct Chat", fontWeight = FontWeight.Bold) },
      text = {
        Text("Select a contact to open a real-time direct conversation.")
      },
      confirmButton = {
        Button(
          onClick = {
            selectedConvId = "conv_admin"
            showNewChatDialog = false
          },
          colors = ButtonDefaults.buttonColors(containerColor = XXQSapphire)
        ) {
          Text("Chat with Admin")
        }
      },
      dismissButton = {
        TextButton(onClick = { showNewChatDialog = false }) { Text("Cancel") }
      },
      containerColor = XXQDarkBg,
      titleContentColor = Color.White
    )
  }
}
