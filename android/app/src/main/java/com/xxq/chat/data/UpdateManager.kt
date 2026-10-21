package com.xxq.chat.data

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

object UpdateManager {
  private const val DEFAULT_BACKEND_URL = "https://xxq-chat-backend.onrender.com"

  /**
   * Queries the official update endpoint for Android updates
   */
  suspend fun checkForUpdates(
    currentVersion: String,
    backendUrl: String = DEFAULT_BACKEND_URL
  ): AppUpdateCheckResult? = withContext(Dispatchers.IO) {
    try {
      val urlString = "$backendUrl/api/updates/check?platform=android&arch=universal&version=${Uri.encode(currentVersion)}"
      val url = URL(urlString)
      val connection = (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 10000
        readTimeout = 10000
        setRequestProperty("Accept", "application/json")
        setRequestProperty("User-Agent", "XXQ-Chat-Android")
      }

      if (connection.responseCode != 200) {
        return@withContext null
      }

      val jsonText = connection.inputStream.bufferedReader().use { it.readText() }
      val json = JSONObject(jsonText)

      val updateAvailable = json.optBoolean("updateAvailable", false)
      val latestVersion = json.optString("latestVersion", currentVersion)
      val releaseNotes = json.optString("releaseNotes", "")
      val githubReleaseUrl = json.optString("githubReleaseUrl", "")
      val message = json.optString("message", "")

      val artifactObj = json.optJSONObject("artifact")
      val artifact = if (artifactObj != null) {
        AppUpdateArtifact(
          fileName = artifactObj.optString("fileName", "XXQ-Chat-Android-debug.apk"),
          fileSize = artifactObj.optLong("fileSize", 0L),
          sha256 = artifactObj.optString("sha256", ""),
          downloadUrl = artifactObj.optString("downloadUrl", ""),
          installType = artifactObj.optString("installType", "apk"),
          instruction = if (artifactObj.has("instruction") && !artifactObj.isNull("instruction")) artifactObj.getString("instruction") else null
        )
      } else null

      AppUpdateCheckResult(
        updateAvailable = updateAvailable,
        currentInstalledVersion = currentVersion,
        latestVersion = latestVersion,
        releaseNotes = releaseNotes,
        githubReleaseUrl = githubReleaseUrl,
        artifact = artifact,
        message = message
      )
    } catch (e: Exception) {
      null
    }
  }

  /**
   * Downloads the APK file to cache directory and verifies its SHA-256 checksum
   */
  suspend fun downloadAndVerifyApk(
    downloadUrl: String,
    expectedSha256: String,
    destinationFile: File,
    onProgress: (Int) -> Unit
  ): Boolean = withContext(Dispatchers.IO) {
    try {
      var currentUrl = downloadUrl
      var redirects = 0
      var connection: HttpURLConnection? = null

      while (redirects < 5) {
        val url = URL(currentUrl)
        connection = (url.openConnection() as HttpURLConnection).apply {
          instanceFollowRedirects = false
          connectTimeout = 15000
          readTimeout = 30000
          setRequestProperty("User-Agent", "XXQ-Chat-Android-Updater")
        }

        val code = connection.responseCode
        if (code in 300..399) {
          val location = connection.getHeaderField("Location") ?: break
          currentUrl = location
          redirects++
        } else {
          break
        }
      }

      if (connection == null || connection.responseCode != 200) {
        return@withContext false
      }

      val totalBytes = connection.contentLength
      var transferredBytes = 0L

      destinationFile.parentFile?.mkdirs()
      if (destinationFile.exists()) destinationFile.delete()

      connection.inputStream.use { input ->
        FileOutputStream(destinationFile).use { output ->
          val buffer = ByteArray(8192)
          var read: Int
          while (input.read(buffer).also { read = it } != -1) {
            output.write(buffer, 0, read)
            transferredBytes += read
            if (totalBytes > 0) {
              val percent = ((transferredBytes * 100) / totalBytes).toInt().coerceIn(0, 100)
              onProgress(percent)
            }
          }
        }
      }

      // Verify SHA-256
      val actualSha256 = calculateSha256(destinationFile)
      if (expectedSha256.isNotBlank() && !actualSha256.equals(expectedSha256, ignoreCase = true)) {
        destinationFile.delete()
        return@withContext false
      }

      true
    } catch (e: Exception) {
      if (destinationFile.exists()) destinationFile.delete()
      false
    }
  }

  /**
   * Calculates the SHA-256 checksum of a file
   */
  fun calculateSha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { stream ->
      val buffer = ByteArray(8192)
      var bytesRead: Int
      while (stream.read(buffer).also { bytesRead = it } != -1) {
        digest.update(buffer, 0, bytesRead)
      }
    }
    return digest.digest().joinToString("") { "%02X".format(it) }
  }

  /**
   * Builds an ACTION_VIEW intent using FileProvider for the Android Package Installer
   */
  fun createInstallIntent(context: Context, apkFile: File): Intent {
    val apkUri = FileProvider.getUriForFile(
      context,
      "${context.packageName}.fileprovider",
      apkFile
    )

    return Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(apkUri, "application/vnd.android.package-archive")
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
  }
}
