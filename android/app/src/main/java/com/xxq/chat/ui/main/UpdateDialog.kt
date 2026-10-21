package com.xxq.chat.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.xxq.chat.data.AppUpdateCheckResult
import com.xxq.chat.data.UpdateManager
import com.xxq.chat.theme.XXQDarkBg
import com.xxq.chat.theme.XXQPurple
import com.xxq.chat.theme.XXQTextMuted
import kotlinx.coroutines.launch
import java.io.File

@Composable
fun UpdateDialog(
  updateInfo: AppUpdateCheckResult,
  onDismiss: () -> Unit
) {
  val context = LocalContext.current
  val coroutineScope = rememberCoroutineScope()

  var isDownloading by remember { mutableStateOf(false) }
  var downloadProgress by remember { mutableStateOf(0) }
  var downloadFailed by remember { mutableStateOf(false) }
  var downloadedFile by remember { mutableStateOf<File?>(null) }

  AlertDialog(
    onDismissRequest = {
      if (!isDownloading) onDismiss()
    },
    containerColor = Color(0xFF15102A),
    shape = RoundedCornerShape(24.dp),
    title = {
      Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("🚀", fontSize = 24.sp)
        Column {
          Text(
            text = "Yeni bir güncelleme var: v${updateInfo.latestVersion}",
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White
          )
          Text(
            text = "Mevcut sürüm: v${updateInfo.currentInstalledVersion}",
            fontSize = 11.sp,
            color = XXQTextMuted
          )
        }
      }
    },
    text = {
      Column(
        modifier = Modifier
          .fillMaxWidth()
          .padding(top = 4.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
      ) {
        if (!updateInfo.releaseNotes.isNullOrBlank()) {
          Box(
            modifier = Modifier
              .fillMaxWidth()
              .background(Color(0xFF0B0816), RoundedCornerShape(12.dp))
              .padding(12.dp)
          ) {
            Text(
              text = updateInfo.releaseNotes,
              fontSize = 11.sp,
              color = Color(0xFFE2E8F0),
              lineHeight = 16.sp
            )
          }
        }

        updateInfo.artifact?.let { artifact ->
          Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
              text = "Dosya: ${artifact.fileName} (${(artifact.fileSize / (1024 * 1024))} MB)",
              fontSize = 11.sp,
              color = XXQTextMuted
            )
            if (artifact.sha256.isNotBlank()) {
              Text(
                text = "SHA-256: ${artifact.sha256.take(16)}...",
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace,
                color = Color(0xFFA78BFA)
              )
            }
          }
        }

        if (isDownloading) {
          Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(6.dp)
          ) {
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceBetween
            ) {
              Text("Güncelleme indiriliyor...", fontSize = 11.sp, color = Color.White)
              Text("%$downloadProgress", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = XXQPurple)
            }
            LinearProgressIndicator(
              progress = { downloadProgress / 100f },
              modifier = Modifier.fillMaxWidth(),
              color = XXQPurple,
              trackColor = Color(0xFF2E2450)
            )
          }
        }

        if (downloadFailed) {
          Text(
            text = "İndirme veya SHA-256 sağlama toplamı doğrulaması başarısız oldu. Lütfen tekrar deneyin.",
            fontSize = 11.sp,
            color = Color(0xFFF87171)
          )
        }

        if (downloadedFile != null) {
          Text(
            text = "Güncelleme paketi başarıyla doğrulandı. Yükleme ekranında 'Yükle' seçeneğini onaylayın. Verileriniz korunacaktır.",
            fontSize = 11.sp,
            color = Color(0xFF34D399)
          )
        }

        Text(
          text = "* Android sistemi 'Bilinmeyen kaynaklardan uygulama yükleme' izni isteyebilir. Lütfen Ayarlar'dan bu izni onaylayın.",
          fontSize = 10.sp,
          color = Color(0xFF94A3B8)
        )
      }
    },
    confirmButton = {
      if (downloadedFile != null) {
        Button(
          onClick = {
            val intent = UpdateManager.createInstallIntent(context, downloadedFile!!)
            context.startActivity(intent)
            onDismiss()
          },
          colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669))
        ) {
          Text("Yüklemeyi Başlat")
        }
      } else if (!isDownloading) {
        Button(
          onClick = {
            val artifact = updateInfo.artifact
            if (artifact != null) {
              isDownloading = true
              downloadFailed = false
              coroutineScope.launch {
                val cacheFile = File(context.cacheDir, "updates/${artifact.fileName}")
                val success = UpdateManager.downloadAndVerifyApk(
                  downloadUrl = artifact.downloadUrl,
                  expectedSha256 = artifact.sha256,
                  destinationFile = cacheFile,
                  onProgress = { downloadProgress = it }
                )
                isDownloading = false
                if (success) {
                  downloadedFile = cacheFile
                } else {
                  downloadFailed = true
                }
              }
            }
          },
          colors = ButtonDefaults.buttonColors(containerColor = XXQPurple)
        ) {
          Text("İndir")
        }
      }
    },
    dismissButton = {
      if (!isDownloading) {
        TextButton(onClick = onDismiss) {
          Text("Daha Sonra", color = XXQTextMuted)
        }
      }
    }
  )
}
