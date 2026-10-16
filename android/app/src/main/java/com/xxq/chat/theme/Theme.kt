package com.xxq.chat.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
  primary = XXQPurple,
  secondary = XXQPurpleLight,
  tertiary = XXQPurpleDark,
  background = XXQDarkBg,
  surface = XXQCardBg,
  onPrimary = Color.White,
  onSecondary = Color.Black,
  onTertiary = Color.White,
  onBackground = Color(0xFFF8FAFC),
  onSurface = Color(0xFFF8FAFC),
)

@Composable
fun XXQChatTheme(
  darkTheme: Boolean = true, // Default to sleek dark charcoal & purple mode
  content: @Composable () -> Unit
) {
  val colorScheme = DarkColorScheme
  val view = LocalView.current
  if (!view.isInEditMode) {
    SideEffect {
      val window = (view.context as Activity).window
      window.statusBarColor = XXQDarkBg.toArgb()
      window.navigationBarColor = XXQDarkBg.toArgb()
      WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
      WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = false
    }
  }

  MaterialTheme(
    colorScheme = colorScheme,
    typography = Typography,
    content = content
  )
}
