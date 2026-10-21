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
import androidx.compose.ui.text.style.TextAlign
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
  var showProfileDialog by remember { mutableStateOf(false) }
  var showSupportDialog by remember { mutableStateOf(false) }
  var supportFeedback by remember { mutableStateOf<String?>(null) }
  var showNewChatDialog by remember { mutableStateOf(false) }
  var updateInfo by remember { mutableStateOf<AppUpdateCheckResult?>(null) }
  val context = androidx.compose.ui.platform.LocalContext.current

  LaunchedEffect(Unit) {
    try {
      val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
      val currentVer = packageInfo.versionName ?: "1.0.0"
      val result = UpdateManager.checkForUpdates(currentVersion = currentVer)
      if (result != null && result.updateAvailable && result.artifact != null) {
        updateInfo = result
      }
    } catch (e: Exception) {
      android.util.Log.w("MainScreen", "Güncelleme denetimi atlandı: ${e.message}")
    }
  }

  updateInfo?.let { update ->
    UpdateDialog(
      updateInfo = update,
      onDismiss = { updateInfo = null }
    )
  }

  // 1. Unauthenticated View: Clean Sign-In / Registration Screen
  if (currentUser == null) {
    var selectedAuthTab by remember { mutableStateOf(0) } // 0: Giriş Yap, 1: Kayıt Ol
    var emailInput by remember { mutableStateOf("") }
    var displayNameInput by remember { mutableStateOf("") }
    var authError by remember { mutableStateOf<String?>(null) }

    Scaffold(
      containerColor = XXQDarkBg
    ) { padding ->
      Box(
        modifier = Modifier
          .fillMaxSize()
          .padding(padding)
          .padding(24.dp),
        contentAlignment = Alignment.Center
      ) {
        Card(
          colors = CardDefaults.cardColors(containerColor = XXQCardBg),
          shape = RoundedCornerShape(20.dp),
          modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 440.dp)
        ) {
          Column(
            modifier = Modifier
              .fillMaxWidth()
              .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
          ) {
            // App Branding Header
            Box(
              modifier = Modifier
                .size(54.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(XXQPurple),
              contentAlignment = Alignment.Center
            ) {
              Text("Q", fontWeight = FontWeight.ExtraBold, color = Color.White, fontSize = 30.sp)
            }
            Spacer(Modifier.height(12.dp))
            Text("XXQ Chat", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Text(
              "Gizlilik ve Güvenlik Odaklı Topluluk Ağı",
              fontSize = 12.sp,
              color = XXQTextMuted,
              textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(20.dp))

            // Clean Auth Tabs: "Giriş Yap" and "Kayıt Ol"
            TabRow(
              selectedTabIndex = selectedAuthTab,
              containerColor = XXQSidebarBg,
              contentColor = Color.White,
              modifier = Modifier.clip(RoundedCornerShape(10.dp))
            ) {
              Tab(
                selected = selectedAuthTab == 0,
                onClick = {
                  selectedAuthTab = 0
                  authError = null
                },
                text = { Text("Giriş Yap", fontWeight = FontWeight.SemiBold) }
              )
              Tab(
                selected = selectedAuthTab == 1,
                onClick = {
                  selectedAuthTab = 1
                  authError = null
                },
                text = { Text("Kayıt Ol", fontWeight = FontWeight.SemiBold) }
              )
            }

            Spacer(Modifier.height(20.dp))

            authError?.let { err ->
              Text(
                err,
                color = Color(0xFFF87171),
                fontSize = 12.sp,
                modifier = Modifier.padding(bottom = 12.dp)
              )
            }

            if (selectedAuthTab == 0) {
              // --- GİRİŞ YAP TAB ---
              OutlinedTextField(
                value = emailInput,
                onValueChange = { emailInput = it },
                label = { Text("E-posta Adresi") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                  focusedBorderColor = XXQPurpleLight,
                  unfocusedBorderColor = XXQBorder,
                  focusedTextColor = Color.White,
                  unfocusedTextColor = Color.White,
                  focusedLabelColor = XXQPurpleLight,
                  unfocusedLabelColor = XXQTextMuted
                )
              )

              Spacer(Modifier.height(16.dp))

              Button(
                onClick = {
                  if (emailInput.isBlank() || !emailInput.contains("@")) {
                    authError = "Lütfen geçerli bir e-posta adresi girin."
                  } else {
                    viewModel.login(emailInput.trim(), "", false)
                  }
                },
                colors = ButtonDefaults.buttonColors(containerColor = XXQPurple),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier
                  .fillMaxWidth()
                  .height(48.dp)
              ) {
                Text("Giriş Yap", fontWeight = FontWeight.Bold, fontSize = 15.sp)
              }

              Spacer(Modifier.height(14.dp))

              Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
              ) {
                HorizontalDivider(modifier = Modifier.weight(1f), color = XXQBorder)
                Text(" veya ", fontSize = 12.sp, color = XXQTextMuted, modifier = Modifier.padding(horizontal = 8.dp))
                HorizontalDivider(modifier = Modifier.weight(1f), color = XXQBorder)
              }

              Spacer(Modifier.height(14.dp))

              OutlinedButton(
                onClick = {
                  val testEmail = if (emailInput.isNotBlank()) emailInput.trim() else "kullanici@xxqchat.com"
                  viewModel.login(testEmail, "Google Kullanıcısı", false)
                },
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                modifier = Modifier
                  .fillMaxWidth()
                  .height(48.dp)
              ) {
                Text("G  Google ile Giriş Yap", fontWeight = FontWeight.SemiBold)
              }

              Spacer(Modifier.height(16.dp))

              Card(
                colors = CardDefaults.cardColors(containerColor = XXQSidebarBg),
                shape = RoundedCornerShape(8.dp)
              ) {
                Text(
                  "ℹ️ Topluluk erişimi için onaylı Google hesabınızı veya davet edilmiş e-postanızı kullanın.",
                  fontSize = 11.sp,
                  color = XXQTextMuted,
                  modifier = Modifier.padding(10.dp)
                )
              }
            } else {
              // --- KAYIT OL TAB ---
              OutlinedTextField(
                value = emailInput,
                onValueChange = { emailInput = it },
                label = { Text("E-posta Adresi") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                  focusedBorderColor = XXQPurpleLight,
                  unfocusedBorderColor = XXQBorder,
                  focusedTextColor = Color.White,
                  unfocusedTextColor = Color.White,
                  focusedLabelColor = XXQPurpleLight,
                  unfocusedLabelColor = XXQTextMuted
                )
              )

              Spacer(Modifier.height(12.dp))

              OutlinedTextField(
                value = displayNameInput,
                onValueChange = { displayNameInput = it },
                label = { Text("Görünen İsim (Ad Soyad)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                  focusedBorderColor = XXQPurpleLight,
                  unfocusedBorderColor = XXQBorder,
                  focusedTextColor = Color.White,
                  unfocusedTextColor = Color.White,
                  focusedLabelColor = XXQPurpleLight,
                  unfocusedLabelColor = XXQTextMuted
                )
              )

              Spacer(Modifier.height(16.dp))

              Button(
                onClick = {
                  if (emailInput.isBlank() || !emailInput.contains("@")) {
                    authError = "Lütfen geçerli bir e-posta adresi girin."
                  } else {
                    viewModel.register(emailInput.trim(), displayNameInput.trim())
                  }
                },
                colors = ButtonDefaults.buttonColors(containerColor = XXQPurple),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier
                  .fillMaxWidth()
                  .height(48.dp)
              ) {
                Text("Kayıt Ol", fontWeight = FontWeight.Bold, fontSize = 15.sp)
              }

              Spacer(Modifier.height(14.dp))

              Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
              ) {
                HorizontalDivider(modifier = Modifier.weight(1f), color = XXQBorder)
                Text(" veya ", fontSize = 12.sp, color = XXQTextMuted, modifier = Modifier.padding(horizontal = 8.dp))
                HorizontalDivider(modifier = Modifier.weight(1f), color = XXQBorder)
              }

              Spacer(Modifier.height(14.dp))

              OutlinedButton(
                onClick = {
                  val testEmail = if (emailInput.isNotBlank()) emailInput.trim() else "aday@xxqchat.com"
                  val testName = if (displayNameInput.isNotBlank()) displayNameInput.trim() else "Yeni Üye Adayı"
                  viewModel.register(testEmail, testName)
                },
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                modifier = Modifier
                  .fillMaxWidth()
                  .height(48.dp)
              ) {
                Text("G  Google ile Kayıt Ol", fontWeight = FontWeight.SemiBold)
              }

              Spacer(Modifier.height(16.dp))

              Card(
                colors = CardDefaults.cardColors(containerColor = XXQSidebarBg),
                shape = RoundedCornerShape(8.dp)
              ) {
                Text(
                  "ℹ️ Kayıt başvurunuz sistem yöneticisi veya moderatör onayı sonrasında aktifleşir.",
                  fontSize = 11.sp,
                  color = XXQTextMuted,
                  modifier = Modifier.padding(10.dp)
                )
              }
            }
          }
        }
      }
    }
    return
  }

  // 2. Whitelist Restricted View: Pending or Rejected States
  if (whitelistStatus.modeActive && !whitelistStatus.canAccessApp) {
    val isRejected = whitelistStatus.status == "rejected" || currentUser?.status == "rejected"

    Scaffold(
      topBar = {
        TopAppBar(
          title = { Text("XXQ Chat", fontWeight = FontWeight.Bold) },
          actions = {
            TextButton(onClick = { viewModel.logout() }) {
              Text("Çıkış Yap", color = XXQPurpleLight)
            }
          },
          colors = TopAppBarDefaults.topAppBarColors(containerColor = XXQDarkBg, titleContentColor = Color.White)
        )
      },
      containerColor = XXQDarkBg
    ) { padding ->
      Box(
        modifier = Modifier
          .fillMaxSize()
          .padding(padding)
          .padding(24.dp),
        contentAlignment = Alignment.Center
      ) {
        Card(
          colors = CardDefaults.cardColors(containerColor = XXQCardBg),
          shape = RoundedCornerShape(20.dp),
          modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 440.dp)
        ) {
          Column(
            modifier = Modifier
              .fillMaxWidth()
              .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
          ) {
            Text(if (isRejected) "🚫" else "⏳", fontSize = 52.sp)
            Spacer(Modifier.height(16.dp))

            Text(
              if (isRejected) "Erişim Talebiniz Onaylanmadı" else "Erişim Onayı Bekleniyor",
              fontSize = 20.sp,
              fontWeight = FontWeight.Bold,
              color = Color.White,
              textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(8.dp))

            Text(
              if (isRejected)
                "XXQ Chat yetkilileri tarafından başvurunuz incelenmiş ve bu aşamada onaylanmamıştır."
              else
                "XXQ Chat kontrollü erişim modundadır. Hesabınız sistem yöneticisi veya yetkili moderatör incelemesindedir.",
              fontSize = 13.sp,
              color = XXQTextMuted,
              textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(16.dp))

            // Status Badge
            Surface(
              color = if (isRejected) Color(0xFF7F1D1D) else XXQPurpleDark,
              shape = RoundedCornerShape(12.dp)
            ) {
              Text(
                if (isRejected) "Durum: Reddedildi" else "Durum: İnceleniyor (Sırada)",
                color = if (isRejected) Color(0xFFFCA5A5) else XXQPurpleLight,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
              )
            }

            Spacer(Modifier.height(16.dp))

            // Applicant Info Card (Displays display name, avoids exposing email)
            Card(
              colors = CardDefaults.cardColors(containerColor = XXQSidebarBg),
              shape = RoundedCornerShape(10.dp),
              modifier = Modifier.fillMaxWidth()
            ) {
              Column(modifier = Modifier.padding(14.dp)) {
                Text(
                  "Başvuran: ${currentUser?.displayName ?: "Kullanıcı"}",
                  fontWeight = FontWeight.SemiBold,
                  fontSize = 13.sp,
                  color = Color.White
                )
                Spacer(Modifier.height(4.dp))
                Text(
                  if (isRejected)
                    "Karar kaydı saklanmaktadır. Bir hata olduğunu düşünüyorsanız destek ekibine mesaj iletebilirsiniz."
                  else
                    "Topluluk güvenliği gereği yetkili onayı tamamlanana kadar sohbet ve kanal erişimi kapalı tutulur.",
                  fontSize = 11.sp,
                  color = XXQTextMuted
                )
              }
            }

            Spacer(Modifier.height(20.dp))

            supportFeedback?.let { msg ->
              Text(
                msg,
                color = XXQSuccess,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(bottom = 12.dp)
              )
            }

            if (!isRejected) {
              Button(
                onClick = {
                  viewModel.checkWhitelistStatus()
                },
                colors = ButtonDefaults.buttonColors(containerColor = XXQPurple),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier
                  .fillMaxWidth()
                  .height(46.dp)
              ) {
                Text("Onay Durumunu Kontrol Et", fontWeight = FontWeight.Bold)
              }
              Spacer(Modifier.height(10.dp))
            }

            // "Destekle Konuş" Button
            OutlinedButton(
              onClick = { showSupportDialog = true },
              shape = RoundedCornerShape(10.dp),
              colors = ButtonDefaults.outlinedButtonColors(
                contentColor = if (isRejected) Color.White else XXQPurpleLight
              ),
              modifier = Modifier
                .fillMaxWidth()
                .height(46.dp)
            ) {
              Text("Destekle Konuş", fontWeight = FontWeight.SemiBold)
            }

            Spacer(Modifier.height(10.dp))

            TextButton(
              onClick = { viewModel.logout() }
            ) {
              Text("Çıkış Yap / Başka Hesapla Giriş Yap", color = XXQTextMuted, fontSize = 12.sp)
            }
          }
        }
      }
    }

    // Support Message Dialog
    if (showSupportDialog) {
      var supportTitle by remember { mutableStateOf("Erişim onayı hk.") }
      var supportDesc by remember { mutableStateOf("") }
      var supportError by remember { mutableStateOf<String?>(null) }

      AlertDialog(
        onDismissRequest = { showSupportDialog = false },
        title = { Text("Destek Ekibiyle İletişime Geç", fontWeight = FontWeight.Bold) },
        text = {
          Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
              "Başvuran: ${currentUser?.displayName ?: "Kullanıcı"}",
              fontWeight = FontWeight.SemiBold,
              fontSize = 12.sp,
              color = XXQPurpleLight
            )

            Card(
              colors = CardDefaults.cardColors(containerColor = XXQSidebarBg),
              shape = RoundedCornerShape(8.dp)
            ) {
              Text(
                "ℹ️ Destek mesajı göndermek otomatik onay garantisi vermez; talebiniz yetkililer tarafından incelenir.",
                fontSize = 11.sp,
                color = XXQTextMuted,
                modifier = Modifier.padding(8.dp)
              )
            }

            supportError?.let {
              Text(it, color = Color(0xFFF87171), fontSize = 11.sp)
            }

            OutlinedTextField(
              value = supportTitle,
              onValueChange = { supportTitle = it },
              label = { Text("Konu") },
              singleLine = true,
              modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
              value = supportDesc,
              onValueChange = { supportDesc = it },
              label = { Text("Mesajınız / Açıklama") },
              minLines = 3,
              modifier = Modifier.fillMaxWidth()
            )
          }
        },
        confirmButton = {
          Button(
            onClick = {
              if (supportDesc.isBlank()) {
                supportError = "Lütfen bir mesaj yazın."
              } else {
                viewModel.submitSupportMessage(supportTitle, supportDesc)
                showSupportDialog = false
                supportFeedback = "Destek mesajınız yetkililere başarıyla iletildi."
              }
            },
            colors = ButtonDefaults.buttonColors(containerColor = XXQPurple)
          ) {
            Text("Mesajı Gönder")
          }
        },
        dismissButton = {
          TextButton(onClick = { showSupportDialog = false }) { Text("İptal") }
        },
        containerColor = XXQDarkBg,
        titleContentColor = Color.White
      )
    }
    return
  }

  // 3. Admin Security View (Platform Admin only)
  if (showAdminView) {
    Scaffold(
      topBar = {
        TopAppBar(
          title = { Text("Güvenlik Yönetimi", fontWeight = FontWeight.Bold, fontSize = 18.sp) },
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
                  Text("Beyaz Liste Erişim Denetimi", fontWeight = FontWeight.Bold, color = Color.White)
                  Text(
                    if (whitelistStatus.modeActive) "Mod: AÇIK (Katı Onay)" else "Mod: KAPALI (Açık Erişim)",
                    fontSize = 12.sp,
                    color = if (whitelistStatus.modeActive) XXQPurpleLight else XXQSuccess
                  )
                }
                Switch(
                  checked = whitelistStatus.modeActive,
                  onCheckedChange = { viewModel.toggleWhitelistMode(it) },
                  colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = XXQPurple
                  )
                )
              }
            }
          }
        }

        // Whitelist Directory Section
        item {
          Text("Onaylı Beyaz Liste Dizini", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color.White)
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
                Text("Onaylayan: ${item.approvedBy}", fontSize = 11.sp, color = XXQTextMuted)
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
          Text("Sistem Güvenlik Denetim Günlükleri", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color.White)
        }

        items(auditLogs) { log ->
          Card(
            colors = CardDefaults.cardColors(containerColor = XXQSidebarBg),
            shape = RoundedCornerShape(10.dp)
          ) {
            Column(modifier = Modifier.padding(10.dp)) {
              Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(log.action, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = XXQPurpleLight)
                Text(log.createdAt, fontSize = 11.sp, color = XXQTextMuted)
              }
              Text("Yetkili: ${log.actorEmail}", fontSize = 11.sp, color = Color.White)
              if (log.target != null) {
                Text("Hedef: ${log.target}", fontSize = 11.sp, color = XXQTextMuted)
              }
            }
          }
        }
      }
    }
    return
  }

  // 4. Direct Chat View
  if (selectedConvId != null) {
    val activeConv = conversations.find { it.id == selectedConvId }
    val convMessages = messagesMap[selectedConvId] ?: emptyList()
    var inputText by remember { mutableStateOf("") }

    Scaffold(
      topBar = {
        TopAppBar(
          title = {
            Column {
              Text(activeConv?.name ?: "Sohbet", fontWeight = FontWeight.Bold, fontSize = 16.sp)
              Text("çevrimiçi", fontSize = 11.sp, color = XXQSuccess)
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
              .fillMaxWidth()
              .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically
          ) {
            TextField(
              value = inputText,
              onValueChange = { inputText = it },
              placeholder = { Text("Mesaj yazın...", color = XXQTextMuted) },
              modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(24.dp)),
              colors = TextFieldDefaults.colors(
                focusedContainerColor = XXQSidebarBg,
                unfocusedContainerColor = XXQSidebarBg,
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent
              )
            )
            Spacer(Modifier.width(8.dp))
            IconButton(
              onClick = {
                if (inputText.isNotBlank()) {
                  viewModel.sendMessage(selectedConvId!!, inputText)
                  inputText = ""
                }
              },
              modifier = Modifier
                .size(48.dp)
                .background(XXQPurple, CircleShape)
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
                Text(msg.senderName, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = XXQPurpleLight)
              }
              Text(msg.content, color = Color.White, fontSize = 14.sp)
              Row(
                modifier = Modifier.align(Alignment.End),
                verticalAlignment = Alignment.CenterVertically
              ) {
                Text(msg.createdAt, fontSize = 10.sp, color = if (isMe) Color(0xFFDDD6FE) else XXQTextMuted)
                if (isMe) {
                  Spacer(Modifier.width(4.dp))
                  Text(if (msg.status == "read") "✓✓" else "✓", fontSize = 10.sp, color = if (msg.status == "read") XXQPurpleLight else Color(0xFFDDD6FE))
                }
              }
            }
          }
        }
      }
    }
    return
  }

  // 5. Default Conversation List View
  Scaffold(
    topBar = {
      TopAppBar(
        title = {
          Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
              modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(XXQPurple),
              contentAlignment = Alignment.Center
            ) {
              Text("Q", fontWeight = FontWeight.ExtraBold, color = Color.White, fontSize = 18.sp)
            }
            Spacer(Modifier.width(10.dp))
            Column {
              Text("XXQ Chat", fontWeight = FontWeight.Bold, fontSize = 18.sp)
              Text("Canlı Ağ Geçidi", fontSize = 10.sp, color = XXQSuccess)
            }
          }
        },
        actions = {
          if (currentUser?.isAdmin == true) {
            IconButton(onClick = { showAdminView = true }) {
              Text("🛡", fontSize = 18.sp)
            }
          }
          IconButton(onClick = { showProfileDialog = true }) {
            Box(
              modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(XXQPurple),
              contentAlignment = Alignment.Center
            ) {
              Text(
                (currentUser?.displayName?.take(1) ?: "U").uppercase(),
                fontWeight = FontWeight.Bold,
                color = Color.White,
                fontSize = 14.sp
              )
            }
          }
        },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = XXQDarkBg, titleContentColor = Color.White)
      )
    },
    floatingActionButton = {
      FloatingActionButton(
        onClick = { showNewChatDialog = true },
        containerColor = XXQPurple,
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
              .background(XXQPurple),
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
                conv.lastMessage?.content ?: "Henüz mesaj yok",
                fontSize = 13.sp,
                color = XXQTextMuted,
                maxLines = 1
              )
              if (conv.unreadCount > 0) {
                Box(
                  modifier = Modifier
                    .clip(CircleShape)
                    .background(XXQPurple)
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

  // User Profile Dialog
  if (showProfileDialog) {
    AlertDialog(
      onDismissRequest = { showProfileDialog = false },
      title = { Text("Kullanıcı Profili", fontWeight = FontWeight.Bold) },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Text("İsim: ${currentUser?.displayName ?: "-"}", color = Color.White)
          Text("E-posta: ${currentUser?.email ?: "-"}", color = XXQTextMuted, fontSize = 13.sp)
          Text(
            if (currentUser?.isAdmin == true) "Yetki: Sistem Yöneticisi" else "Yetki: Onaylı Üye",
            color = if (currentUser?.isAdmin == true) XXQPurpleLight else XXQSuccess,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold
          )
        }
      },
      confirmButton = {
        Button(
          onClick = {
            viewModel.logout()
            showProfileDialog = false
          },
          colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626))
        ) {
          Text("Çıkış Yap")
        }
      },
      dismissButton = {
        TextButton(onClick = { showProfileDialog = false }) { Text("Kapat") }
      },
      containerColor = XXQDarkBg,
      titleContentColor = Color.White
    )
  }

  // New Chat Dialog
  if (showNewChatDialog) {
    AlertDialog(
      onDismissRequest = { showNewChatDialog = false },
      title = { Text("Birebir Sohbet Başlat", fontWeight = FontWeight.Bold) },
      text = {
        Text("Gerçek zamanlı bir doğrudan mesajlaşma açmak için bir kişi seçin.")
      },
      confirmButton = {
        Button(
          onClick = {
            selectedConvId = "conv_admin"
            showNewChatDialog = false
          },
          colors = ButtonDefaults.buttonColors(containerColor = XXQPurple)
        ) {
          Text("Yönetici ile Sohbet Et")
        }
      },
      dismissButton = {
        TextButton(onClick = { showNewChatDialog = false }) { Text("İptal") }
      },
      containerColor = XXQDarkBg,
      titleContentColor = Color.White
    )
  }
}