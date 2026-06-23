package com.labtrace.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * Labtrace Android WebView Activity
 * 
 * This is a minimal Android wrapper that loads the Labtrace web app
 * from local assets and provides file access for data import.
 */
public class MainActivity extends Activity {
    
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_REQUEST_CODE = 1;
    private static final long MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB 文件大小上限
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Setup WebView
        webView = new WebView(this);
        setContentView(webView);
        
        // Configure WebSettings
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        
        // 仅在 Debug 构建中启用 WebView 调试
        if (BuildConfig.DEBUG && Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        
        // Add JavaScript interface for native features
        webView.addJavascriptInterface(new LabtraceInterface(), "Android");
        
        // Handle file chooser for import
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, 
                    FileChooserParams params) {
                filePathCallback = callback;
                
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                
                // Allow multiple file selection for PDFs
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                
                intent.setType("*/*");
                startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE);
                return true;
            }
        });
        
        // Load the web app
        webView.loadUrl("file:///android_asset/index.html");
        
        // 恢复 WebView 状态
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        }
    }
    
    @Override
    protected void onSaveInstanceState(Bundle outState) {
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
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
    
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            Uri[] results = null;
            
            if (resultCode == Activity.RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    // Multiple files selected
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    // Single file selected
                    results = new Uri[]{data.getData()};
                }
            }
            
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
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
    
    /**
     * JavaScript Interface for native Android features
     */
    public class LabtraceInterface {
        
        @JavascriptInterface
        public String readFileAsBase64(String uriString) {
            try {
                Uri uri = Uri.parse(uriString);
                InputStream inputStream = getContentResolver().openInputStream(uri);
                if (inputStream == null) return null;
                
                // 检查文件大小，防止 OOM
                long size = getContentResolver().openFileDescriptor(uri, "r")
                        .getStatSize();
                if (size > MAX_FILE_SIZE) {
                    inputStream.close();
                    return null;
                }
                
                ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                int bytesRead;
                while ((bytesRead = inputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, bytesRead);
                }
                inputStream.close();
                
                return android.util.Base64.encodeToString(
                    outputStream.toByteArray(), 
                    android.util.Base64.DEFAULT
                );
            } catch (IOException e) {
                e.printStackTrace();
                return null;
            }
        }
        
        @JavascriptInterface
        public String getAppVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (PackageManager.NameNotFoundException e) {
                return BuildConfig.VERSION_NAME;
            }
        }
        
        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> {
                android.widget.Toast.makeText(MainActivity.this, message, 
                    android.widget.Toast.LENGTH_SHORT).show();
            });
        }
    }
}
