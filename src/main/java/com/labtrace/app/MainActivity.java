package com.labtrace.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * Labtrace Android WebView Activity.
 *
 * <p>Minimal Android wrapper that loads the Labtrace web app from local assets
 * and provides file access for data import and native PDF viewing.</p>
 *
 * <p>Security measures:</p>
 * <ul>
 *   <li>JS Bridge input validation (length, charset, format)</li>
 *   <li>File size limits enforced on all native read paths</li>
 *   <li>WebViewAssetLoader serves local assets via https://appassets.androidplatform.net/</li>
 *   <li>Temp files use predictable naming and are cleaned up</li>
 * </ul>
 */
@SuppressWarnings("unused")
@SuppressLint("SetJavaScriptEnabled")
public class MainActivity extends Activity {

    private static final String TAG = "Labtrace";
    private static final boolean DEBUG = false;
    private static final String VERSION_NAME = "1.0.0";

    private static final int FILE_CHOOSER_REQUEST_CODE = 1;
    private static final long MAX_FILE_SIZE = 50L * 1024 * 1024; // 50MB
    private static final long MAX_VIEW_FILE_SIZE = 100L * 1024 * 1024; // 100MB for viewFile
    private static final int MAX_BASE64_LENGTH = 150 * 1024 * 1024; // ~100MB binary → ~133MB base64
    private static final int MAX_FILENAME_LENGTH = 255;
    private static final int MAX_TOAST_LENGTH = 500;
    // Allow alphanumerics, dot, underscore, hyphen, CJK chars (U+4E00–U+9FA5), and space
    private static final String ALLOWED_FILENAME_REGEX =
            "^[a-zA-Z0-9._\\-\\x{4e00}-\\x{9fa5} ]+$";

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private WebViewAssetLoader assetLoader;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        // Set up WebViewAssetLoader to serve local assets via https://appassets.androidplatform.net/
        // This avoids file:// URL restrictions and allows fetch() to work for WASM files
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Security: disable mixed content and file:// access; WebViewAssetLoader handles local assets
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setBlockNetworkLoads(false); // Need network for CDN fallback
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        if (DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        webView.addJavascriptInterface(new LabtraceInterface(), "Android");

        // Use WebViewAssetLoader to intercept asset requests
        webView.setWebViewClient(new WebViewClient() {
            @Nullable
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    @NonNull WebView view,
                    @NonNull WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(@NonNull WebView view,
                    @NonNull ValueCallback<Uri[]> callback,
                    @NonNull FileChooserParams params) {
                filePathCallback = callback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);

                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }

                intent.setType("*/*");
                startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE);
                return true;
            }
        });

        // Load from WebViewAssetLoader domain instead of file://
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.destroy();
            webView = null;
        }
        // Clean up temp files from file viewing
        cleanupTempFiles();
        super.onDestroy();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            Uri[] results = null;

            if (resultCode == Activity.RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }

            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    /** Clean up temporary files created by viewFile(). */
    private void cleanupTempFiles() {
        try {
            File[] cacheDirs = {getExternalCacheDir(), getCacheDir()};
            for (File cacheDir : cacheDirs) {
                if (cacheDir == null) continue;
                File[] tempFiles = cacheDir.listFiles((dir, name) ->
                        name.startsWith("labtrace_view_"));
                if (tempFiles != null) {
                    for (File f : tempFiles) {
                        if (!f.delete()) {
                            Log.w(TAG, "Could not delete temp file: " + f.getAbsolutePath());
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Temp file cleanup failed", e);
        }
    }

    /**
     * JavaScript Interface for native Android features.
     *
     * <p>All methods validate their inputs to prevent abuse:</p>
     * <ul>
     *   <li>String inputs are length-limited and charset-checked</li>
     *   <li>Base64 data is validated before decoding</li>
     *   <li>File names are sanitized to prevent path traversal</li>
     * </ul>
     */
    public class LabtraceInterface {

        /**
         * Read a content URI's contents as a Base64-encoded string.
         * Enforces maximum file size to prevent memory exhaustion.
         */
        @JavascriptInterface
        public String readFileAsBase64(String uriString) {
            // Validate input
            if (uriString == null || uriString.isEmpty()) {
                Log.w(TAG, "readFileAsBase64: null/empty uri");
                return null;
            }
            if (uriString.length() > 2048) {
                Log.w(TAG, "readFileAsBase64: uri too long");
                return null;
            }

            Uri uri;
            try {
                uri = Uri.parse(uriString);
            } catch (Exception e) {
                Log.w(TAG, "readFileAsBase64: invalid uri");
                return null;
            }

            InputStream inputStream = null;
            android.content.res.AssetFileDescriptor fd = null;
            try {
                inputStream = getContentResolver().openInputStream(uri);
                if (inputStream == null) return null;

                // Check file size before reading
                fd = getContentResolver().openAssetFileDescriptor(uri, "r");
                if (fd != null) {
                    long size = fd.getLength();
                    fd.close();
                    fd = null;
                    if (size > MAX_FILE_SIZE) {
                        Log.w(TAG, "readFileAsBase64: file too large (" + size + " bytes)");
                        inputStream.close();
                        return null;
                    }
                    if (size <= 0) {
                        // Unknown size — read with streaming limit
                        return readStreamWithLimit(inputStream);
                    }
                }

                ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                int bytesRead;
                long totalRead = 0;
                while ((bytesRead = inputStream.read(buffer)) != -1) {
                    totalRead += bytesRead;
                    if (totalRead > MAX_FILE_SIZE) {
                        Log.w(TAG, "readFileAsBase64: exceeded size limit during read");
                        outputStream.close();
                        return null;
                    }
                    outputStream.write(buffer, 0, bytesRead);
                }
                inputStream.close();

                return android.util.Base64.encodeToString(
                        outputStream.toByteArray(),
                        android.util.Base64.DEFAULT
                );
            } catch (IOException e) {
                Log.e(TAG, "readFileAsBase64 error", e);
                return null;
            } finally {
                if (fd != null) {
                    try { fd.close(); } catch (IOException ignored) { }
                }
                if (inputStream != null) {
                    try { inputStream.close(); } catch (IOException ignored) { }
                }
            }
        }

        /**
         * Read an InputStream with a maximum byte limit (for unknown-size content).
         * Uses {@link #MAX_FILE_SIZE} as the limit.
         */
        private String readStreamWithLimit(InputStream is) throws IOException {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int bytesRead;
            long total = 0;
            while ((bytesRead = is.read(buffer)) != -1) {
                total += bytesRead;
                if (total > MAX_FILE_SIZE) {
                    out.close();
                    is.close();
                    Log.w(TAG, "readStreamWithLimit: exceeded limit");
                    return null;
                }
                out.write(buffer, 0, bytesRead);
            }
            is.close();
            return android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.DEFAULT);
        }

        /** Returns the application version name. */
        @JavascriptInterface
        public String getAppVersion() {
            try {
                String versionName = getPackageManager()
                        .getPackageInfo(getPackageName(), 0).versionName;
                return versionName != null ? versionName : VERSION_NAME;
            } catch (PackageManager.NameNotFoundException e) {
                Log.e(TAG, "getAppVersion error", e);
                return VERSION_NAME;
            }
        }

        /**
         * Show a short toast message on the UI thread.
         * Input is length-limited to prevent UI abuse.
         */
        @JavascriptInterface
        public void showToast(String message) {
            String safeMessage = (message == null) ? "" : message;
            if (safeMessage.length() > MAX_TOAST_LENGTH) {
                safeMessage = safeMessage.substring(0, MAX_TOAST_LENGTH) + "...";
            }
            final String finalMessage = safeMessage;
            runOnUiThread(() ->
                    Toast.makeText(MainActivity.this, finalMessage, Toast.LENGTH_SHORT).show()
            );
        }

        /**
         * Returns "true" to let the web app know that native file viewing is available.
         */
        @JavascriptInterface
        public String isViewFileAvailable() {
            return "true";
        }

        /**
         * Write Base64-encoded file data to a temporary file and open it with the
         * system default viewer (PDF reader, image gallery, etc.).
         *
         * <p>Input validation:</p>
         * <ul>
         *   <li>base64Data: must be valid Base64, within size limit</li>
         *   <li>fileName: sanitized, max 255 chars, must match allowed charset</li>
         *   <li>mimeTypeHint: validated against allowed MIME pattern</li>
         * </ul>
         *
         * @param base64Data   Base64-encoded file contents
         * @param fileName     Original file name (used for extension-based MIME detection)
         * @param mimeTypeHint MIME type hint from the caller (e.g. "application/pdf")
         * @return "ok" on success, or an error message string on failure
         */
        @JavascriptInterface
        public String viewFile(String base64Data, String fileName, String mimeTypeHint) {
            // Validate base64Data
            if (base64Data == null || base64Data.isEmpty()) {
                return "error: empty data";
            }
            if (base64Data.length() > MAX_BASE64_LENGTH) {
                return "error: file too large (max 100MB)";
            }

            // Validate fileName
            if (fileName == null || fileName.isEmpty()) {
                return "error: empty filename";
            }
            if (fileName.length() > MAX_FILENAME_LENGTH) {
                return "error: filename too long";
            }
            // Prevent path traversal and dangerous characters
            String safeFileName = fileName.replaceAll("[/\\\\]", "_");
            if (!safeFileName.matches(ALLOWED_FILENAME_REGEX)) {
                // Try to sanitize: keep only safe characters
                safeFileName = safeFileName.replaceAll("[^a-zA-Z0-9._\\-\\x{4e00}-\\x{9fa5} ]", "_");
            }
            if (safeFileName.isEmpty()) {
                safeFileName = "labtrace_file";
            }

            // Validate mimeTypeHint
            String safeMime = "*/*";
            if (mimeTypeHint != null && !mimeTypeHint.isEmpty()) {
                // Only allow standard MIME type format: type/subtype
                if (mimeTypeHint.matches("^[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-*]+$")) {
                    safeMime = mimeTypeHint;
                } else {
                    Log.w(TAG, "viewFile: rejected invalid mime type: " + mimeTypeHint);
                }
            }

            try {
                byte[] fileBytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);

                if (fileBytes.length > MAX_VIEW_FILE_SIZE) {
                    return "error: decoded file too large";
                }

                // Determine file extension from filename
                String ext = "";
                int lastDot = safeFileName.lastIndexOf('.');
                if (lastDot >= 0 && lastDot < safeFileName.length() - 1) {
                    ext = safeFileName.substring(lastDot);
                }

                // Create temp file in cache directory
                File cacheDir = getExternalCacheDir();
                if (cacheDir == null) {
                    cacheDir = getCacheDir();
                }
                File tempFile = new File(cacheDir, "labtrace_view_" + System.currentTimeMillis() + ext);

                // Write bytes to temp file
                FileOutputStream fos = new FileOutputStream(tempFile);
                fos.write(fileBytes);
                fos.flush();
                fos.close();

                // Use FileProvider to generate content:// URI (required on Android 7.0+)
                Uri fileUri = FileProvider.getUriForFile(
                        MainActivity.this,
                        getPackageName() + ".fileprovider",
                        tempFile
                );

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(fileUri, safeMime);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

                // Verify there's an app to handle this intent
                if (intent.resolveActivity(getPackageManager()) == null) {
                    Log.w(TAG, "viewFile: no app to handle mime type: " + safeMime);
                    // Still try to open — some systems return null even when apps exist
                }

                startActivity(intent);

                return "ok";
            } catch (IllegalArgumentException e) {
                Log.e(TAG, "viewFile: invalid base64 data", e);
                return "error: invalid file data";
            } catch (Exception e) {
                Log.e(TAG, "viewFile error: " + e.getMessage(), e);
                return "error: " + e.getMessage();
            }
        }
    }
}
