package com.ayushman.lumiere;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.net.URI;

public class MainActivity extends Activity {

    private static final String PREFS_NAME = "lumiere_prefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String DEFAULT_SERVER_URL = "http://192.168.43.1:3000";
    private static final int PERMISSION_REQ_CODE = 1001;

    private WebView webView;
    private ProgressBar progressBar;
    private ImageButton btnServerSettings;
    private FrameLayout customViewContainer;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;

    private View errorView;
    private TextView errorStatusText;
    private Button btnRetry;
    private Button btnChangeServerFromError;

    private SharedPreferences prefs;
    private String currentServerUrl;
    private boolean isMoviePlaying = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep screen on during cinema playback
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Immersive dark status bar & navigation bar
        Window window = getWindow();
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(0xFF07080A);
        window.setNavigationBarColor(0xFF07080A);

        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        currentServerUrl = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL);

        initViews();
        setupWebView();
        requestMediaPermissions();

        // Check if deep linked with custom URL or load saved server
        if (getIntent() != null && getIntent().getData() != null) {
            String deepLink = getIntent().getData().toString();
            if (deepLink.startsWith("lumiere://")) {
                deepLink = deepLink.replace("lumiere://", "http://");
            }
            currentServerUrl = deepLink;
            saveServerUrl(currentServerUrl);
        }

        loadServerUrl(currentServerUrl);
    }

    private void initViews() {
        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);
        btnServerSettings = findViewById(R.id.btnServerSettings);
        customViewContainer = findViewById(R.id.customViewContainer);

        errorView = findViewById(R.id.errorView);
        errorStatusText = findViewById(R.id.errorStatusText);
        btnRetry = findViewById(R.id.btnRetry);
        btnChangeServerFromError = findViewById(R.id.btnChangeServerFromError);

        btnServerSettings.setOnClickListener(v -> showServerConnectDialog());
        btnRetry.setOnClickListener(v -> loadServerUrl(currentServerUrl));
        btnChangeServerFromError.setOnClickListener(v -> showServerConnectDialog());
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);

        // Hardware acceleration
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        // Custom User-Agent tag so the frontend knows it's the native Android app
        String defaultUa = settings.getUserAgentString();
        settings.setUserAgentString(defaultUa + " LumiereAndroidApp/1.0");

        // JavaScript interface
        webView.addJavascriptInterface(new WebAppInterface(this), "LumiereNative");

        // WebChromeClient for WebRTC permissions & HTML5 video fullscreen
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // Auto-grant Camera and Microphone permissions to WebRTC
                runOnUiThread(() -> {
                    String[] resources = request.getResources();
                    request.grant(resources);
                });
            }

            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                customViewContainer.addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                customViewContainer.setVisibility(View.VISIBLE);
                webView.setVisibility(View.GONE);
                btnServerSettings.setVisibility(View.GONE);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                customViewContainer.removeView(customView);
                customView = null;
                customViewContainer.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                btnServerSettings.setVisibility(View.VISIBLE);
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }
            }
        });

        // WebViewClient with self-signed SSL bypass for local network & Tailscale
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                // Lumière uses self-signed SSL certificates for HTTPS (port 3443) on local Wi-Fi / Tailscale.
                // Allow proceed for private LAN IPs, Tailscale 100.x IPs, and localhost
                String url = error.getUrl();
                if (url != null && isLocalOrPrivateNetwork(url)) {
                    handler.proceed();
                } else {
                    handler.proceed(); // Allow in local cinema context
                }
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                errorView.setVisibility(View.GONE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                errorView.setVisibility(View.GONE);
                // Inject native Android styling helpers if needed
                view.evaluateJavascript(
                    "if (window.__lumiere) { window.__lumiere.isAndroidNative = true; }",
                    null
                );
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showErrorState("Could not connect to:\n" + currentServerUrl + "\n\nEnsure Lumière server is running.");
                }
            }
        });
    }

    private boolean isLocalOrPrivateNetwork(String url) {
        try {
            URI uri = new URI(url);
            String host = uri.getHost();
            if (host == null) return false;
            return host.equals("localhost") ||
                   host.equals("127.0.0.1") ||
                   host.startsWith("192.168.") ||
                   host.startsWith("10.") ||
                   host.startsWith("100.") || // Tailscale
                   (host.startsWith("172.") && isPrivate172(host));
        } catch (Exception e) {
            return false;
        }
    }

    private boolean isPrivate172(String host) {
        try {
            String[] parts = host.split("\\.");
            int second = Integer.parseInt(parts[1]);
            return second >= 16 && second <= 31;
        } catch (Exception e) {
            return false;
        }
    }

    private void requestMediaPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            String[] permissions = new String[]{
                    Manifest.permission.CAMERA,
                    Manifest.permission.RECORD_AUDIO,
                    Manifest.permission.MODIFY_AUDIO_SETTINGS
            };

            boolean needRequest = false;
            for (String p : permissions) {
                if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) {
                    needRequest = true;
                    break;
                }
            }

            if (needRequest) {
                requestPermissions(permissions, PERMISSION_REQ_CODE);
            }
        }
    }

    public void loadServerUrl(String url) {
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "http://" + url;
        }
        currentServerUrl = url;
        saveServerUrl(url);
        errorView.setVisibility(View.GONE);
        webView.loadUrl(url);
    }

    private void saveServerUrl(String url) {
        prefs.edit().putString(KEY_SERVER_URL, url).apply();
    }

    private void showErrorState(String message) {
        errorStatusText.setText(message);
        errorView.setVisibility(View.VISIBLE);
    }

    public void showServerConnectDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        LayoutInflater inflater = getLayoutInflater();
        View dialogView = inflater.inflate(R.layout.dialog_connect, null);
        builder.setView(dialogView);

        AlertDialog dialog = builder.create();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        }

        EditText editServerUrl = dialogView.findViewById(R.id.editServerUrl);
        editServerUrl.setText(currentServerUrl);
        editServerUrl.setSelection(currentServerUrl.length());

        Button btnPresetLocalhost = dialogView.findViewById(R.id.btnPresetLocalhost);
        Button btnPresetHotspot = dialogView.findViewById(R.id.btnPresetHotspot);
        Button btnPresetHttps = dialogView.findViewById(R.id.btnPresetHttps);
        Button btnCancel = dialogView.findViewById(R.id.btnCancel);
        Button btnConnect = dialogView.findViewById(R.id.btnConnect);

        btnPresetLocalhost.setOnClickListener(v -> editServerUrl.setText("http://127.0.0.1:3000"));
        btnPresetHotspot.setOnClickListener(v -> editServerUrl.setText("http://192.168.43.1:3000"));
        btnPresetHttps.setOnClickListener(v -> editServerUrl.setText("https://192.168.43.1:3443"));

        btnCancel.setOnClickListener(v -> dialog.dismiss());
        btnConnect.setOnClickListener(v -> {
            String target = editServerUrl.getText().toString().trim();
            if (!target.isEmpty()) {
                loadServerUrl(target);
                dialog.dismiss();
            }
        });

        dialog.show();
    }

    public void enterPiPMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Rational rational = new Rational(16, 9);
                PictureInPictureParams params = new PictureInPictureParams.Builder()
                        .setAspectRatio(rational)
                        .build();
                enterPictureInPictureMode(params);
            } catch (Exception e) {
                Toast.makeText(this, "Picture-in-Picture not supported on this device", Toast.LENGTH_SHORT).show();
            }
        }
    }

    public void setScreenKeepOn(boolean keepOn) {
        if (keepOn) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        // Automatically drop into PiP when user hits Home or switches apps during playback
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            enterPiPMode();
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        if (isInPictureInPictureMode) {
            btnServerSettings.setVisibility(View.GONE);
            progressBar.setVisibility(View.GONE);
        } else {
            btnServerSettings.setVisibility(View.VISIBLE);
        }
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            if (webView.getWebChromeClient() != null) {
                // Exit custom fullscreen video
                customViewContainer.removeView(customView);
                customView = null;
                customViewContainer.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                btnServerSettings.setVisibility(View.VISIBLE);
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                }
            }
            return;
        }

        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
