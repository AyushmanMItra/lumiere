package com.ayushman.lumiere;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

public class WebAppInterface {
    private final MainActivity activity;

    public WebAppInterface(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public boolean isNativeAndroidApp() {
        return true;
    }

    @JavascriptInterface
    public void triggerPictureInPicture() {
        activity.runOnUiThread(activity::enterPiPMode);
    }

    @JavascriptInterface
    public void setKeepScreenOn(boolean keepOn) {
        activity.runOnUiThread(() -> activity.setScreenKeepOn(keepOn));
    }

    @JavascriptInterface
    public void openServerDialog() {
        activity.runOnUiThread(activity::showServerConnectDialog);
    }

    @JavascriptInterface
    public void showToast(String message) {
        if (message == null || message.trim().isEmpty()) return;
        activity.runOnUiThread(() -> Toast.makeText(activity, message, Toast.LENGTH_SHORT).show());
    }

    @JavascriptInterface
    public void vibrate(long milliseconds) {
        try {
            Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(milliseconds);
                }
            }
        } catch (Exception ignored) {}
    }
}
