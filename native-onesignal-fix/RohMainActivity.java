package com.roh.team.educational;

import android.animation.ValueAnimator;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import com.getcapacitor.BridgeActivity;
import com.onesignal.OneSignal;

/**
 * Main Capacitor activity for Roh Al-Tafawuq.
 * The native overlay is optional and never prevents the WebView from launching.
 */
public class RohMainActivity extends BridgeActivity {
    private static final String ONESIGNAL_APP_ID = "f96774ae-3355-4a66-bda2-7a44730432fe";
    private ViewGroup host;
    private View splash;
    private boolean released;
    private ValueAnimator splashProgressAnimator;
    private android.window.OnBackInvokedCallback backCallback;
    private final android.os.Handler oneSignalHandler = new android.os.Handler(android.os.Looper.getMainLooper());

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        registerBackDispatcher();

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;

        // Screen capture is allowed by default. The website can opt in to protection.
        getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
        webView.setBackgroundColor(Color.rgb(16, 22, 74));
        webView.addJavascriptInterface(new RohBridge(), "RohAndroid");
        initializeOneSignal();
        publishOneSignalPlayerId(0);

        // Do not replace Capacitor's internal WebViewClient: it owns bridge and
        // navigation handling. Replacing it can make the application unstable.
        View parent = webView.getParent() instanceof View ? (View) webView.getParent() : null;
        if (!(parent instanceof ViewGroup)) return;

        host = (ViewGroup) parent;
        try {
            splash = createSplash();
            host.addView(splash, new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));
            // The overlay is intentionally kept until the loaded website calls
            // RohAndroid.webReady(). There is no timeout fallback by design.
        } catch (Exception ignored) {
            // The WebView remains usable even when the optional overlay cannot be attached.
            splash = null;
        }
    }

    private void initializeOneSignal() {
        try {
            OneSignal.initWithContext(this, ONESIGNAL_APP_ID);
            if (!getSharedPreferences("roh_onesignal", MODE_PRIVATE)
                    .getBoolean("permission_requested", false)) {
                getSharedPreferences("roh_onesignal", MODE_PRIVATE).edit()
                        .putBoolean("permission_requested", true).apply();
                new android.os.Handler(getMainLooper()).postDelayed(() -> {
                    if (android.os.Build.VERSION.SDK_INT >= 33
                            && checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                            != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 9001);
                    }
                }, 1200L);
            }
        } catch (Exception ignored) {
            // Notification setup must never prevent the web app from opening.
        }
    }

    private String readOneSignalPlayerId() {
        try {
            String id = OneSignal.getUser().getPushSubscription().getId();
            if (id != null && !id.trim().isEmpty()) {
                getSharedPreferences("roh_onesignal", MODE_PRIVATE).edit()
                        .putString("player_id", id.trim())
                        .putString("subscription_id", id.trim())
                        .apply();
                return id.trim();
            }
        } catch (Exception ignored) { }
        return getSharedPreferences("roh_onesignal", MODE_PRIVATE)
                .getString("player_id", "");
    }

    private void publishOneSignalPlayerId(int attempt) {
        String id = readOneSignalPlayerId();
        if (id.isEmpty()) {
            if (attempt < 5) {
                long delay = new long[]{1000L, 2000L, 4000L, 7000L, 10000L}[attempt];
                oneSignalHandler.postDelayed(() -> publishOneSignalPlayerId(attempt + 1), delay);
            }
            return;
        }
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        String escaped = id.replace("\\", "\\\\").replace("'", "\\'");
        String js = "(function(){var id='" + escaped + "';"
                + "window.NativeOneSignalPlayerId=id;"
                + "window.NativeOneSignalId=id;"
                + "try{window.dispatchEvent(new CustomEvent('roh:onesignal-player-id',{detail:{playerId:id,id:id}}));}catch(e){}"
                + "try{window.postMessage({type:'ROH_ONESIGNAL_PLAYER_ID',playerId:id,id:id},'*');}catch(e){}"
                + "})();";
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    private void registerBackDispatcher() {
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            backCallback = this::handleBackNavigation;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    backCallback);
        }
    }

    private void unregisterBackDispatcher() {
        if (android.os.Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
            backCallback = null;
        }
    }

    private void handleBackNavigation() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            finish();
            return;
        }
        // Use the actual WebView back/forward list as the source of truth. This
        // avoids treating a long-lived SPA history.length as endless navigation.
        android.webkit.WebBackForwardList history = webView.copyBackForwardList();
        if (webView.canGoBack() && history.getCurrentIndex() > 0) {
            webView.goBack();
            return;
        }
        // Do not call super.onBackPressed() from an OnBackInvoked callback: on
        // Android 13+ that can dispatch the same callback again indefinitely.
        finish();
    }

    @Override
    public void onBackPressed() {
        // Android versions below 13 reach this method; Android 13+ uses the dispatcher.
        handleBackNavigation();
    }

    @Override
    public void onDestroy() {
        unregisterBackDispatcher();
        if (splashProgressAnimator != null) {
            splashProgressAnimator.cancel();
            splashProgressAnimator = null;
        }
        super.onDestroy();
    }

    private View createSplash() {
        FrameLayout box = new FrameLayout(this);
        box.setBackgroundColor(Color.rgb(7, 17, 29));
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        box.addView(content, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        int logoId = getResources().getIdentifier("icon", "drawable", getPackageName());
        if (logoId != 0) {
            ImageView logo = new ImageView(this);
            logo.setImageResource(logoId);
            logo.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
            content.addView(logo, new LinearLayout.LayoutParams(dp(96), dp(96)));
        }

        LinearLayout dots = new LinearLayout(this);
        dots.setOrientation(LinearLayout.HORIZONTAL);
        dots.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams dotsParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        dotsParams.topMargin = dp(22);
        content.addView(dots, dotsParams);
        TextView[] dotViews = new TextView[3];
        int[] dotColors = {Color.rgb(73, 184, 102), Color.rgb(168, 216, 63), Color.rgb(89, 183, 250)};
        for (int i = 0; i < dotViews.length; i++) {
            TextView dot = new TextView(this);
            dot.setText("●");
            dot.setTextSize(12);
            dot.setTextColor(dotColors[i]);
            dot.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams dotParams = new LinearLayout.LayoutParams(dp(15), dp(15));
            dotParams.setMargins(dp(2), 0, dp(2), 0);
            dots.addView(dot, dotParams);
            dotViews[i] = dot;
        }
        splashProgressAnimator = ValueAnimator.ofFloat(0f, 1f);
        splashProgressAnimator.setDuration(1150L);
        splashProgressAnimator.setRepeatCount(ValueAnimator.INFINITE);
        splashProgressAnimator.addUpdateListener(animation -> {
            float phase = (Float) animation.getAnimatedValue();
            for (int i = 0; i < dotViews.length; i++) {
                float wave = (float) Math.sin((phase * Math.PI * 2) - (i * .75));
                dotViews[i].setAlpha(.42f + ((wave + 1f) * .29f));
                dotViews[i].setTranslationY(-dp(4) * Math.max(0f, wave));
            }
        });
        splashProgressAnimator.start();
        return box;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void applyScreenCaptureProtection(boolean protectedScreen) {
        if (protectedScreen) {
            getWindow().setFlags(
                    android.view.WindowManager.LayoutParams.FLAG_SECURE,
                    android.view.WindowManager.LayoutParams.FLAG_SECURE);
        } else {
            getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
        }
    }

    private void releaseSplash() {
        runOnUiThread(() -> {
            if (released) return;
            if (splashProgressAnimator != null) {
                splashProgressAnimator.cancel();
                splashProgressAnimator = null;
            }
            released = true;
            if (host != null && splash != null) {
                host.removeView(splash);
                splash = null;
            }
        });
    }

    private class RohBridge {
        @JavascriptInterface
        public void webReady() {
            releaseSplash();
        }

        @JavascriptInterface
        public void setScreenCaptureProtection(boolean protectedScreen) {
            runOnUiThread(() -> applyScreenCaptureProtection(protectedScreen));
        }

        @JavascriptInterface
        public void setScreenshotProtectionEnabled(boolean enabled) {
            runOnUiThread(() -> applyScreenCaptureProtection(enabled));
        }

        @JavascriptInterface
        public void setScreenCaptureAllowed(boolean allowed) {
            runOnUiThread(() -> applyScreenCaptureProtection(!allowed));
        }

        @JavascriptInterface
        public void receiveSubscriptionId(String id) {
            if (id != null && !id.trim().isEmpty()) {
                getSharedPreferences("roh_onesignal", MODE_PRIVATE)
                        .edit()
                        .putString("player_id", id.trim())
                        .putString("subscription_id", id.trim())
                        .apply();
            }
        }

        @JavascriptInterface
        public String getOneSignalPlayerId() {
            return readOneSignalPlayerId();
        }

        @JavascriptInterface
        public String getOneSignalId() {
            return readOneSignalPlayerId();
        }

        @JavascriptInterface
        public String getSubscriptionId() {
            return readOneSignalPlayerId();
        }

        @JavascriptInterface
        public void requestOneSignalPlayerId() {
            publishOneSignalPlayerId(0);
        }

        @JavascriptInterface
        public void openNativePdfViewer(String url, String title) {
            openNativePdfViewer(url, title, false);
        }

        @JavascriptInterface
        public void openNativePdfViewer(String url, String title, boolean preventScreenshots) {
            runOnUiThread(() -> {
                try {
                    android.content.Intent intent = new android.content.Intent(RohMainActivity.this, RohPdfViewerActivity.class);
                    intent.putExtra(RohPdfViewerActivity.EXTRA_URL, url == null ? "" : url);
                    intent.putExtra(RohPdfViewerActivity.EXTRA_TITLE, title == null ? "ملف PDF" : title);
                    intent.putExtra(RohPdfViewerActivity.EXTRA_PREVENT_SCREENSHOTS, preventScreenshots);
                    startActivity(intent);
                } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public void openNativeVideoViewer(String url, String title) {
            openNativeVideoViewer(url, title, false);
        }

        @JavascriptInterface
        public void openNativeVideoViewer(String url, String title, boolean preventScreenshots) {
            runOnUiThread(() -> {
                try {
                    android.content.Intent intent = new android.content.Intent(RohMainActivity.this, RohExoPlayerActivity.class);
                    intent.putExtra(RohExoPlayerActivity.EXTRA_URL, url == null ? "" : url);
                    intent.putExtra(RohExoPlayerActivity.EXTRA_TITLE, title == null ? "فيديو" : title);
                    intent.putExtra(RohExoPlayerActivity.EXTRA_PREVENT_SCREENSHOTS, preventScreenshots);
                    startActivity(intent);
                } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public void openStorageManager() {
            runOnUiThread(() -> {
                try {
                    startActivity(new android.content.Intent(RohMainActivity.this, RohStorageManagementActivity.class));
                } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public void openNativeChatViewer(String url, String title, String theme) {
            runOnUiThread(() -> {
                try {
                    android.content.Intent intent = new android.content.Intent(RohMainActivity.this, RohChatWebViewActivity.class);
                    intent.putExtra(RohChatWebViewActivity.EXTRA_URL, url == null ? "" : url);
                    intent.putExtra(RohChatWebViewActivity.EXTRA_TITLE, title == null ? "الدردشة" : title);
                    intent.putExtra(RohChatWebViewActivity.EXTRA_THEME, theme == null ? "dark" : theme);
                    startActivity(intent);
                } catch (Exception ignored) { }
            });
        }
    }
}
