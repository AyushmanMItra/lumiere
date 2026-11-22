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
import android.widget.ScrollView;
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

    // Dedicated Cinema Starting Page Views
    private ScrollView startPageView;
    private EditText startServerUrlInput;
    private Button btnStartPresetHotspot;
    private Button btnStartPresetTailscale;
    private Button btnStartPresetLocalhost;
    private ProgressBar startProgressBar;
    private TextView startStatusText;
    private Button btnStartConnect;

    // Legacy fallback error views
    private View errorView;
    private TextView errorStatusText;
    private Button btnRetry;
    private Button btnChangeServerFromError;

    private SharedPreferences prefs;
    private String currentServerUrl;
    private boolean isConnectedToWebsite = false;
    private boolean isConnectionInProgress = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep screen on during cinema playback
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Immersive dark status bar and navigation bar
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

        // Check if deep linked with custom URL
        if (getIntent() != null && getIntent().getData() != null) {
            String deepLink = getIntent().getData().toString();
            if (deepLink.startsWith("lumiere://")) {
                deepLink = deepLink.replace("lumiere://", "http://");
            }
            currentServerUrl = deepLink;
            saveServerUrl(currentServerUrl);
            startServerUrlInput.setText(currentServerUrl);
            attemptConnect(currentServerUrl);
        } else {
            // Display dedicated starting page initially
            showStartPage();
        }
    }

    private void initViews() {
        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);
        btnServerSettings = findViewById(R.id.btnServerSettings);
        customViewContainer = findViewById(R.id.customViewContainer);

        // Dedicated Cinema Starting Page View bindings
        startPageView = findViewById(R.id.startPageView);
        startServerUrlInput = findViewById(R.id.startServerUrlInput);
        btnStartPresetHotspot = findViewById(R.id.btnStartPresetHotspot);
        btnStartPresetTailscale = findViewById(R.id.btnStartPresetTailscale);
        btnStartPresetLocalhost = findViewById(R.id.btnStartPresetLocalhost);
        startProgressBar = findViewById(R.id.startProgressBar);
        startStatusText = findViewById(R.id.startStatusText);
        btnStartConnect = findViewById(R.id.btnStartConnect);

        startServerUrlInput.setText(currentServerUrl);

        // Quick Preset click listeners
        btnStartPresetHotspot.setOnClickListener(v -> {
            startServerUrlInput.setText("http://192.168.43.1:3000");
            startServerUrlInput.setSelection(startServerUrlInput.getText().length());
        });

        btnStartPresetTailscale.setOnClickListener(v -> {
            startServerUrlInput.setText("https://192.168.43.1:3443");
            startServerUrlInput.setSelection(startServerUrlInput.getText().length());
        });

        btnStartPresetLocalhost.setOnClickListener(v -> {
            startServerUrlInput.setText("http://127.0.0.1:3000");
            startServerUrlInput.setSelection(startServerUrlInput.getText().length());
        });

        // Primary Connect Button on Starting Page
        btnStartConnect.setOnClickListener(v -> {
            String target = startServerUrlInput.getText().toString().trim();
            if (!target.isEmpty()) {
                attemptConnect(target);
            } else {
                startStatusText.setVisibility(View.VISIBLE);
                startStatusText.setTextColor(0xFFED4245);
                startStatusText.setText("Please enter a valid server address.");
            }
        });

        // The floating settings button is strictly hidden when connected to website
        btnServerSettings.setVisibility(View.GONE);
        btnServerSettings.setOnClickListener(v -> showStartPage());

        // Error view fallback
        errorView = findViewById(R.id.errorView);
        errorStatusText = findViewById(R.id.errorStatusText);
        btnRetry = findViewById(R.id.btnRetry);
        btnChangeServerFromError = findViewById(R.id.btnChangeServerFromError);

        btnRetry.setOnClickListener(v -> attemptConnect(currentServerUrl));
        btnChangeServerFromError.setOnClickListener(v -> showStartPage());
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

        // Custom User-Agent tag so the frontend knows it is the native Android app
        String defaultUa = settings.getUserAgentString();
        settings.setUserAgentString(defaultUa + " LumiereAndroidApp/1.0");

        // JavaScript interface
        webView.addJavascriptInterface(new WebAppInterface(this), "LumiereNative");

        // WebChromeClient for WebRTC permissions and HTML5 video fullscreen
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
                btnServerSettings.setVisibility(View.GONE);
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }
            }
        });

        // WebViewClient with self-signed SSL bypass for local network and Tailscale
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                // Lumière uses self-signed SSL certificates for HTTPS (port 3443) on local Wi-Fi / Tailscale.
                String url = error.getUrl();
                if (url != null && isLocalOrPrivateNetwork(url)) {
                    handler.proceed();
                } else {
                    handler.proceed();
                }
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                errorView.setVisibility(View.GONE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                errorView.setVisibility(View.GONE);

                // Check if page load was genuine
                if (isConnectionInProgress) {
                    isConnectionInProgress = false;
                    isConnectedToWebsite = true;

                    // Transition to website: Hide starting page, show webView, hide settings button
                    startPageView.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
                    btnServerSettings.setVisibility(View.GONE);
                    btnStartConnect.setEnabled(true);
                    startProgressBar.setVisibility(View.GONE);
                    startStatusText.setVisibility(View.GONE);
                }

                // Inject native Android styling helpers
                view.evaluateJavascript(
                    "if (window.__lumiere) { window.__lumiere.isAndroidNative = true; }",
                    null
                );
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    isConnectionInProgress = false;
                    isConnectedToWebsite = false;
                    showErrorOnStartPage("Could not connect to:\n" + currentServerUrl + "\n\nPlease ensure your Lumière server is running and accessible on this network.");
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

    public void attemptConnect(String url) {
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "http://" + url;
        }
        currentServerUrl = url;
        saveServerUrl(url);

        isConnectionInProgress = true;
        startProgressBar.setVisibility(View.VISIBLE);
        startStatusText.setVisibility(View.VISIBLE);
        startStatusText.setTextColor(0xFF5865F2);
        startStatusText.setText("Connecting to " + url + "...");
        btnStartConnect.setEnabled(false);

        loadServerUrl(url);
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

    public void showStartPage() {
        isConnectedToWebsite = false;
        isConnectionInProgress = false;

        webView.setVisibility(View.GONE);
        errorView.setVisibility(View.GONE);
        btnServerSettings.setVisibility(View.GONE);

        startPageView.setVisibility(View.VISIBLE);
        startProgressBar.setVisibility(View.GONE);
        startStatusText.setVisibility(View.GONE);
        btnStartConnect.setEnabled(true);
        startServerUrlInput.setText(currentServerUrl);
        startServerUrlInput.setSelection(currentServerUrl.length());
    }

    private void showErrorOnStartPage(String message) {
        webView.setVisibility(View.GONE);
        errorView.setVisibility(View.GONE);
        btnServerSettings.setVisibility(View.GONE);

        startPageView.setVisibility(View.VISIBLE);
        btnStartConnect.setEnabled(true);
        startProgressBar.setVisibility(View.GONE);
        startStatusText.setVisibility(View.VISIBLE);
        startStatusText.setTextColor(0xFFED4245);
        startStatusText.setText(message);
    }

    private void showErrorState(String message) {
        showErrorOnStartPage(message);
    }

    public void showServerConnectDialog() {
        showStartPage();
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isConnectedToWebsite) {
            enterPiPMode();
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        // btnServerSettings is kept strictly GONE
        btnServerSettings.setVisibility(View.GONE);
        if (isInPictureInPictureMode) {
            progressBar.setVisibility(View.GONE);
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
                btnServerSettings.setVisibility(View.GONE);
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                }
            }
            return;
        }

        // If currently on the Dedicated Starting Page, back exits the application
        if (startPageView != null && startPageView.getVisibility() == View.VISIBLE) {
            super.onBackPressed();
            return;
        }

        // If inside the web application:
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            // At root landing page of the website: return to the Starting Page
            showStartPage();
        }
    }
}
