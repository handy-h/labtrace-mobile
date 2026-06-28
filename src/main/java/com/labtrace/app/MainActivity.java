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
import java.util.concurrent.ConcurrentHashMap;

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
    // DEBUG flag controls WebView remote debugging. Set to false for production builds.
    private static final boolean DEBUG = false;
    private static final String VERSION_NAME = "1.0.0";

    private static final int FILE_CHOOSER_REQUEST_CODE = 1;
    private static final long MAX_FILE_SIZE = 50L * 1024 * 1024; // 50MB
    private static final long MAX_VIEW_FILE_SIZE = 100L * 1024 * 1024; // 100MB for viewFile
    private static final int MAX_BASE64_LENGTH = 150 * 1024 * 1024; // ~100MB binary → ~133MB base64
    private static final int MAX_FILENAME_LENGTH = 255;
    private static final int MAX_TOAST_LENGTH = 500;
    private static final int MAX_CHUNK_LENGTH = 512 * 1024; // 512KB base64 per chunk
    // MIME type pattern: type/subtype where each part allows alphanumerics, +, ., -
    // Note: \- escapes the hyphen to be literal in the character class
    private static final String MIME_TYPE_PATTERN = "^[a-zA-Z0-9.+\\-]+/[a-zA-Z0-9.+\\-]+$";
    // Session timeout: cleanup incomplete file write sessions after 10 minutes
    private static final long SESSION_TIMEOUT_MS = 10 * 60 * 1000;
    // Base64 character set (standard alphabet + padding)
    private static final String BASE64_PATTERN = "^[A-Za-z0-9+/=]+$";
    // Allow alphanumerics, dot, underscore, hyphen, CJK chars (U+4E00–U+9FA5), and space
    private static final String ALLOWED_FILENAME_REGEX =
            "^[a-zA-Z0-9._\\-\\x{4e00}-\\x{9fa5} ]+$";

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private WebViewAssetLoader assetLoader;
    // File write sessions: maps sessionId -> SessionInfo(file, createdAt)
    // Using ConcurrentHashMap for thread-safe access without explicit synchronization.
    private final ConcurrentHashMap<String, SessionInfo> fileWriteSessions = new ConcurrentHashMap<>();
    // Monotonic counter for unique session IDs (avoids nanoTime collisions on rapid calls)
    private static final java.util.concurrent.atomic.AtomicLong SESSION_COUNTER =
            new java.util.concurrent.atomic.AtomicLong(0);

    /** Holds information about an active file write session. */
    private static class SessionInfo {
        final File file;
        final long createdAt;
        SessionInfo(File file) {
            this.file = file;
            this.createdAt = System.currentTimeMillis();
        }
    }

    /**
     * Remove file write sessions older than SESSION_TIMEOUT_MS to prevent memory
     * leaks when JS code abandons a session (e.g. crash before finishFileWrite).
     */
    private void cleanupExpiredSessions() {
        long now = System.currentTimeMillis();
        fileWriteSessions.entrySet().removeIf(entry -> {
            SessionInfo info = entry.getValue();
            if (now - info.createdAt > SESSION_TIMEOUT_MS) {
                if (info.file.exists() && !info.file.delete()) {
                    Log.w(TAG, "cleanupExpiredSessions: could not delete " + info.file.getAbsolutePath());
                }
                Log.d(TAG, "cleanupExpiredSessions: removed stale session " + entry.getKey());
                return true;
            }
            return false;
        });
    }

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
         * Validate and sanitize a MIME type string. Returns "{@literal *}\/{@literal *}"
         * if the input is null, empty, or doesn't match the allowed MIME pattern.
         */
        private String sanitizeMimeType(String mimeType, String callerTag) {
            if (mimeType == null || mimeType.isEmpty()) {
                return "*/*";
            }
            if (mimeType.matches(MIME_TYPE_PATTERN)) {
                return mimeType;
            }
            Log.w(TAG, callerTag + ": rejected invalid mime type: " + mimeType);
            return "*/*";
        }

        /**
         * Encode an error message as Base64 to safely pass it to JavaScript without
         * worrying about quotes, backslashes, newlines, or other special characters
         * that would break string-literal construction in JS.
         */
        private String encodeErrorForJs(Throwable e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            return android.util.Base64.encodeToString(
                    msg.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                    android.util.Base64.NO_WRAP);
        }

        /**
         * Report an error to the JavaScript side via evaluateJavascript().
         * The error message is Base64-encoded and decoded in JS via atob() to
         * safely handle any special characters.
         *
         * <p>If the JS side has set {@code window._activeViewFileCallback} to a
         * per-call function name (used to avoid the legacy global handler being
         * clobbered by concurrent PDF opens), that function is called instead.
         * Falls back to {@code window._viewFileError} for backward compatibility.</p>
         */
        private void reportErrorToJs(String caller, Throwable e) {
            if (webView == null) return;
            final String encoded = encodeErrorForJs(e);
            Log.e(TAG, caller + " error: " + e.getMessage(), e);
            // The JS string looks up _activeViewFileCallback first, then falls back
            // to _viewFileError. Single-quoted Base64 is safe in JS.
            final String js = "(function(){"
                    + "var cb=window._activeViewFileCallback;"
                    + "var fn=cb?window[cb]:(window._viewFileError);"
                    + "if(fn){fn(atob('" + encoded + "'));}"
                    + "})();";
            webView.post(() -> webView.evaluateJavascript(js, null));
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
            String safeMime = sanitizeMimeType(mimeTypeHint, "viewFile");

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
                final File cacheDir = getExternalCacheDir();
                final File tempFile = new File(cacheDir != null ? cacheDir : getCacheDir(),
                        "labtrace_view_" + System.currentTimeMillis() + ext);

                // Write bytes to temp file
                FileOutputStream fos = new FileOutputStream(tempFile);
                fos.write(fileBytes);
                fos.flush();
                fos.close();

                // Use FileProvider to generate content:// URI (required on Android 7.0+)
                final Uri fileUri = FileProvider.getUriForFile(
                        MainActivity.this,
                        getPackageName() + ".fileprovider",
                        tempFile
                );

                final String finalSafeMime = safeMime;
                final Uri finalFileUri = fileUri;

                // startActivity must be called on the UI thread.
                // IMPORTANT: Do NOT block the JavaBridge thread with CountDownLatch —
                // that causes a deadlock/ANR because the JavaBridge thread holds a lock
                // that the UI thread may need. Instead, fire-and-forget on UI thread,
                // and report errors via JS callback.
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            Intent intent = new Intent(Intent.ACTION_VIEW);
                            intent.setDataAndType(finalFileUri, finalSafeMime);
                            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

                            if (intent.resolveActivity(getPackageManager()) == null) {
                                Log.w(TAG, "viewFile: no app to handle mime type: " + finalSafeMime);
                            }

                            startActivity(intent);
                            Log.d(TAG, "viewFile: startActivity succeeded");
                        } catch (Throwable e) {
                            // Catch Throwable (including OutOfMemoryError, SecurityException, etc.)
                            // to prevent the WebView JavaBridge from leaking generic errors.
                            Log.e(TAG, "viewFile UI thread error: " + e.getMessage(), e);
                            reportErrorToJs("viewFile", e);
                        }
                    }
                });

                // Return immediately — don't block the JavaBridge thread
                return "ok";
            } catch (IllegalArgumentException e) {
                Log.e(TAG, "viewFile: invalid base64 data", e);
                return "error: invalid file data";
            } catch (OutOfMemoryError e) {
                Log.e(TAG, "viewFile: out of memory", e);
                return "error: 文件过大，内存不足";
            } catch (Throwable e) {
                // Catch Throwable (including Error) so that OutOfMemoryError etc.
                // don't leak through the WebView JavaBridge as uncaught exceptions.
                Log.e(TAG, "viewFile error: " + e.getMessage(), e);
                return "error: " + e.getMessage();
            }
        }

        /**
         * Start a chunked file write session.
         * Creates a temp file and returns a session ID for subsequent appendChunk calls.
         *
         * @param fileName  Original file name (for extension/MIME detection)
         * @param mimeType  MIME type hint (e.g. "application/pdf")
         * @return session ID on success, or "error: ..." on failure
         */
        @JavascriptInterface
        public String startFileWrite(String fileName, String mimeType) {
            // Single try-catch wrapping the entire method body ensures any unexpected
            // exception (e.g. PatternSyntaxException from input validation) returns
            // a clean "error: ..." string instead of leaking through the WebView
            // JavaBridge framework as a generic "Java exception was raised" error.
            try {
                if (fileName == null || fileName.isEmpty()) {
                    return "error: empty filename";
                }
                if (fileName.length() > MAX_FILENAME_LENGTH) {
                    return "error: filename too long";
                }

                String safeFileName = fileName.replaceAll("[/\\\\]", "_");
                if (!safeFileName.matches(ALLOWED_FILENAME_REGEX)) {
                    safeFileName = safeFileName.replaceAll("[^a-zA-Z0-9._\\-\\x{4e00}-\\x{9fa5} ]", "_");
                }
                if (safeFileName.isEmpty()) {
                    safeFileName = "labtrace_file";
                }

                String safeMime = sanitizeMimeType(mimeType, "startFileWrite");

                String ext = "";
                int lastDot = safeFileName.lastIndexOf('.');
                if (lastDot >= 0 && lastDot < safeFileName.length() - 1) {
                    ext = safeFileName.substring(lastDot);
                }

                File cacheDir = getExternalCacheDir();
                File tempFile = new File(cacheDir != null ? cacheDir : getCacheDir(),
                        "labtrace_view_" + System.currentTimeMillis() + ext);

                // Use System.nanoTime() + a counter to avoid potential ID collisions
                // (original code used currentTimeMillis() + Math.random() which could
                // collide on rapid successive calls).
                String sessionId = "s" + System.nanoTime() + "_" + SESSION_COUNTER.incrementAndGet();
                fileWriteSessions.put(sessionId, new SessionInfo(tempFile));

                // Opportunistic cleanup: if we have too many stale sessions, prune the oldest
                cleanupExpiredSessions();

                Log.d(TAG, "startFileWrite: session=" + sessionId + " file=" + tempFile.getName() + " mime=" + safeMime);
                return sessionId + "|" + safeMime;
            } catch (Throwable e) {
                // Outer catch guards against any exception (e.g. invalid regex, NPE)
                // that would otherwise escape through the WebView JavaBridge.
                Log.e(TAG, "startFileWrite error", e);
                return "error: " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
            }
        }

        /**
         * Append a base64-encoded chunk to a file write session.
         *
         * @param sessionId  Session ID from startFileWrite
         * @param base64Chunk  Base64-encoded data chunk (max 512KB)
         * @return "ok" on success, or "error: ..." on failure
         */
        @JavascriptInterface
        public String appendFileChunk(String sessionId, String base64Chunk) {
            if (sessionId == null || sessionId.isEmpty()) {
                return "error: empty session id";
            }
            if (base64Chunk == null || base64Chunk.isEmpty()) {
                return "error: empty chunk";
            }
            if (base64Chunk.length() > MAX_CHUNK_LENGTH) {
                return "error: chunk too large (max 512KB)";
            }
            // Validate base64 character set to fail fast on malformed input
            // (avoids IllegalArgumentException from Base64.decode and protects against
            // path-traversal-style probes).
            if (!base64Chunk.matches(BASE64_PATTERN)) {
                return "error: invalid base64 characters";
            }

            SessionInfo info = fileWriteSessions.get(sessionId);
            if (info == null) {
                return "error: invalid session";
            }

            try {
                byte[] chunkBytes = android.util.Base64.decode(base64Chunk, android.util.Base64.DEFAULT);
                FileOutputStream fos = new FileOutputStream(info.file, true); // append mode
                fos.write(chunkBytes);
                fos.flush();
                fos.close();
                return "ok";
            } catch (Throwable e) {
                Log.e(TAG, "appendFileChunk error", e);
                return "error: " + e.getMessage();
            }
        }

        /**
         * Finish a chunked file write session and open the file with system viewer.
         *
         * @param sessionId  Session ID from startFileWrite
         * @param mimeType   MIME type for the file
         * @return "ok" if the file open was scheduled, or "error: ..." on synchronous
         *         failure (invalid session, etc.). Asynchronous errors during
         *         startActivity are reported via window._viewFileError().
         */
        @JavascriptInterface
        public String finishFileWrite(String sessionId, String mimeType) {
            if (sessionId == null || sessionId.isEmpty()) {
                return "error: empty session id";
            }

            SessionInfo info = fileWriteSessions.remove(sessionId);
            if (info == null) {
                return "error: invalid session";
            }

            final String safeMime = sanitizeMimeType(mimeType, "finishFileWrite");
            final File finalTempFile = info.file;

            runOnUiThread(() -> {
                try {
                    Uri fileUri = FileProvider.getUriForFile(
                            MainActivity.this,
                            getPackageName() + ".fileprovider",
                            finalTempFile
                    );

                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(fileUri, safeMime);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

                    if (intent.resolveActivity(getPackageManager()) == null) {
                        Log.w(TAG, "finishFileWrite: no app to handle mime: " + safeMime);
                    }

                    startActivity(intent);
                    Log.d(TAG, "finishFileWrite: startActivity succeeded");
                } catch (Throwable e) {
                    reportErrorToJs("finishFileWrite", e);
                }
            });
            return "ok";
        }

        /**
         * Debug: list all available @JavascriptInterface methods on the Android object.
         * Used to diagnose "Java exception was raised" errors.
         */
        @JavascriptInterface
        public String debugListMethods() {
            return "isViewFileAvailable,viewFile,readFileAsBase64,getAppVersion,showToast,startFileWrite,appendFileChunk,finishFileWrite,cancelFileWrite,debugListMethods";
        }

        /**
         * Cancel and clean up a file write session without opening the file.
         */
        @JavascriptInterface
        public void cancelFileWrite(String sessionId) {
            if (sessionId == null || sessionId.isEmpty()) return;
            SessionInfo info = fileWriteSessions.remove(sessionId);
            if (info != null && info.file.exists() && !info.file.delete()) {
                Log.w(TAG, "cancelFileWrite: could not delete " + info.file.getAbsolutePath());
            }
        }
    }
}
