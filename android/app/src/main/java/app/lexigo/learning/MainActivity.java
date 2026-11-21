package app.lexigo.learning;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SafeBrowsingResponse;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Online learning shell. Privileged operations are available only to the first-party main frame. */
public final class MainActivity extends Activity {
    private static final String HOME = "https://beta--lexigo-gaokao-66876.netlify.app";
    private static final String HOST = "beta--lexigo-gaokao-66876.netlify.app";
    private static final String BRIDGE = "LexiGoNative";
    private static final int PICK_FILES = 7001, SAVE_TEXT = 7002;
    private static final int MAX_EXPORT_BYTES = 20 * 1024 * 1024;
    private static final int MAX_MESSAGE_CHARS = 24 * 1024 * 1024;
    private static final int CREAM = 0xfffbf8ef, GREEN = 0xff24583e;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService files = Executors.newSingleThreadExecutor();
    private final Set<String> requests = new HashSet<>();
    private final List<Reply> waitingStatus = new ArrayList<>();
    private WebView web;
    private FrameLayout content;
    private LinearLayout errorPanel;
    private TextView errorText, title;
    private Button back;
    private ProgressBar progress;
    private TextToSpeech tts;
    private boolean ttsInitialized, ttsInitFinished, destroyed, background, pageFailed, visitedSettings;
    private boolean bridgeSupported;
    private int speechGeneration;
    private android.window.OnBackInvokedCallback backCallback;
    private String ttsError = "英语语音正在准备，请稍后再试。";
    private long pageEpoch;
    private Reply speechReply;
    private String utterance;
    private Runnable speechTimeout;
    private ValueCallback<Uri[]> chooser;
    private Set<String> chooserTypes = Collections.emptySet();
    private int chooserLimit = 1;
    private SaveOperation save;
    private AppUpdate appUpdate;

    private static final class Reply {
        final String id;
        final JavaScriptReplyProxy proxy;
        final long epoch;
        boolean complete;
        Reply(String id, JavaScriptReplyProxy proxy, long epoch) { this.id = id; this.proxy = proxy; this.epoch = epoch; }
    }
    private static final class SaveOperation {
        final Reply reply;
        final String name;
        final byte[] bytes;
        volatile boolean cancelled;
        SaveOperation(Reply reply, String name, byte[] bytes) { this.reply = reply; this.name = name; this.bytes = bytes; }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        appUpdate = new AppUpdate(this);
        getWindow().setStatusBarColor(CREAM);
        getWindow().setNavigationBarColor(CREAM);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        buildLayout();
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::navigateBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        initializeSpeech();
        createWebView();
        boolean restored = false;
        if (state != null && state.getBundle("web") != null) {
            try { restored = web.restoreState(state.getBundle("web")) != null && trusted(web.getUrl()); }
            catch (RuntimeException ignored) { restored = false; }
        }
        if (!restored) web.loadUrl(HOME);
        if (!bridgeSupported) showBridgeWarning();
    }

    private void buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(CREAM);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return WindowInsets.CONSUMED;
            });
        } else root.setFitsSystemWindows(true);
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(4), 0, dp(4), 0);
        back = toolbarButton("‹", "返回上一页");
        back.setOnClickListener(v -> navigateBack());
        toolbar.addView(back, new LinearLayout.LayoutParams(dp(48), dp(52)));
        LinearLayout heading = new LinearLayout(this);
        heading.setOrientation(LinearLayout.VERTICAL);
        title = new TextView(this);
        title.setText("拾词 LexiGo"); title.setTextColor(GREEN); title.setTextSize(17); title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        TextView subtitle = new TextView(this);
        subtitle.setText("小学 · 高中英语学习"); subtitle.setTextColor(0xff55705f); subtitle.setTextSize(11);
        heading.addView(title); heading.addView(subtitle);
        toolbar.addView(heading, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button menu = toolbarButton("⋮", "更多选项");
        menu.setOnClickListener(this::showMenu);
        toolbar.addView(menu, new LinearLayout.LayoutParams(dp(48), dp(52)));
        root.addView(toolbar, new LinearLayout.LayoutParams(-1, dp(56)));
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100); progress.setProgressTintList(android.content.res.ColorStateList.valueOf(GREEN));
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(3)));
        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        errorPanel = new LinearLayout(this); errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER); errorPanel.setPadding(dp(26), dp(24), dp(26), dp(24)); errorPanel.setBackgroundColor(CREAM);
        TextView label = new TextView(this); label.setText("暂时无法打开学习页面"); label.setTextSize(22); label.setTextColor(GREEN); label.setGravity(Gravity.CENTER);
        errorText = new TextView(this); errorText.setTextSize(16); errorText.setTextColor(0xff55705f); errorText.setGravity(Gravity.CENTER); errorText.setPadding(0, dp(18), 0, dp(22));
        Button retry = new Button(this); retry.setText("重新连接"); retry.setOnClickListener(v -> loadHomeOrRetry());
        Button browser = new Button(this); browser.setText("用系统浏览器打开"); browser.setOnClickListener(v -> openExternal(Uri.parse(currentUrl())));
        errorPanel.addView(label); errorPanel.addView(errorText);
        errorPanel.addView(retry, new LinearLayout.LayoutParams(-1, dp(52)));
        errorPanel.addView(browser, new LinearLayout.LayoutParams(-1, dp(52)));
        content.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1)); errorPanel.setVisibility(View.GONE);
        setContentView(root);
    }

    private Button toolbarButton(String text, String label) {
        Button b = new Button(this); b.setText(text); b.setTextSize(30); b.setTextColor(GREEN);
        b.setBackgroundColor(Color.TRANSPARENT); b.setPadding(0, 0, 0, 0); b.setMinWidth(dp(48)); b.setContentDescription(label);
        return b;
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private void createWebView() {
        web = new WebView(this); web.setBackgroundColor(CREAM);
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(false);
        s.setAllowFileAccess(false); s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false); s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); s.setSafeBrowsingEnabled(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false); s.setSupportMultipleWindows(false);
        s.setMediaPlaybackRequiresUserGesture(true); s.setGeolocationEnabled(false);
        s.setBuiltInZoomControls(false); s.setDisplayZoomControls(false); s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " LexiGoAndroid/1");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        bridgeSupported = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER);
        if (bridgeSupported) {
            WebViewCompat.addWebMessageListener(web, BRIDGE, Collections.singleton(HOME), (view, message, origin, mainFrame, proxy) -> {
                if (!mainFrame || !trusted(origin) || !trusted(view.getUrl()) || destroyed) return;
                receive(message, proxy);
            });
        }
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                if (!request.isForMainFrame()) return !trusted(request.getUrl());
                if (trusted(request.getUrl())) return false;
                if (request.hasGesture() && webUrl(request.getUrl())) openExternal(request.getUrl());
                else toast("已阻止页面跳转到外部地址，可从菜单选择系统浏览器。");
                return true;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, String url) {
                if (trusted(url)) return false;
                // The request-aware overload is used on supported Android versions; never auto-launch legacy redirects.
                return true;
            }
            @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
                cancelPageRequests(); pageEpoch++;
                if (!trusted(url)) { v.stopLoading(); showError("已阻止不受信任的页面。请用系统浏览器访问外部链接。"); return; }
                pageFailed = false; errorPanel.setVisibility(View.GONE); progress.setVisibility(View.VISIBLE); progress.setProgress(5);
            }
            @Override public void onPageFinished(WebView v, String url) {
                progress.setVisibility(View.INVISIBLE); back.setEnabled(true);
                if (!pageFailed && trusted(url)) errorPanel.setVisibility(View.GONE);
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError error) {
                if (r.isForMainFrame()) showError("请检查网络连接后重试。此应用需要联网加载网站和 AI 服务；本机已保存的记录不会因重试被主动清除。");
            }
            @Override public void onReceivedHttpError(WebView v, WebResourceRequest r, WebResourceResponse response) {
                if (r.isForMainFrame() && response.getStatusCode() >= 400) showError("网站暂时未能响应（HTTP " + response.getStatusCode() + "）。请稍后重试，也可以用系统浏览器检查访问情况。");
            }
            @Override public void onReceivedSslError(WebView v, SslErrorHandler handler, SslError error) {
                handler.cancel(); showError("安全连接验证失败，已停止加载。请检查设备日期和网络后重试。");
            }
            @android.annotation.TargetApi(27)
            @Override public void onSafeBrowsingHit(WebView v, WebResourceRequest r, int type, SafeBrowsingResponse response) {
                response.backToSafety(true); if (r.isForMainFrame()) showError("系统检测到不安全页面，已阻止访问。");
            }
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                cancelPageRequests(); pageEpoch++; content.removeView(v); v.destroy(); web = null;
                showError("网页进程已退出。点击重新连接恢复页面；此前成功保存的草稿仍在本机。"); return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView v, int value) { progress.setProgress(value); if (value >= 100) progress.setVisibility(View.INVISIBLE); }
            @Override public void onReceivedTitle(WebView v, String name) { if (trusted(v.getUrl()) && name != null && !name.trim().isEmpty()) title.setText(name.substring(0, Math.min(90, name.length()))); }
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) { callback.invoke(origin, false, false); }
            @Override public boolean onCreateWindow(WebView v, boolean dialog, boolean gesture, android.os.Message result) { return false; }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                return showFiles(v, callback, params);
            }
        });
        web.setDownloadListener((url, userAgent, disposition, mime, length) -> {
            if (trusted(url)) openExternal(Uri.parse(url));
            else toast("请使用页面的导出按钮保存文件；该下载地址无法安全打开。");
        });
        content.addView(web, 0, new FrameLayout.LayoutParams(-1, -1));
    }

    private static boolean trusted(String url) { try { return url != null && trusted(Uri.parse(url)); } catch (RuntimeException e) { return false; } }
    private static boolean trusted(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme()) && HOST.equalsIgnoreCase(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }
    private static boolean webUrl(Uri uri) {
        return uri != null && ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
                && uri.getHost() != null && uri.getUserInfo() == null;
    }
    private String currentUrl() { return web != null && trusted(web.getUrl()) ? web.getUrl() : HOME; }
    private void showError(String reason) { pageFailed = true; errorText.setText(reason); errorPanel.setVisibility(View.VISIBLE); progress.setVisibility(View.INVISIBLE); }
    private void toast(String message) { if (!destroyed) Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
    private void openExternal(Uri uri) {
        if (!webUrl(uri)) { toast("仅支持打开 http 或 https 网页。"); return; }
        Intent intent = new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE);
        try { startActivity(intent); } catch (ActivityNotFoundException e) { toast("没有找到可用的系统浏览器。"); }
    }
    private void loadHomeOrRetry() {
        String url = currentUrl(); if (web == null) createWebView(); web.loadUrl(url);
        if (!bridgeSupported) showBridgeWarning();
    }
    private void showBridgeWarning() {
        new AlertDialog.Builder(this).setTitle("请更新系统网页组件")
                .setMessage("当前 Android System WebView 不支持安全的原生连接，系统朗读与导出不可用。请更新 Android System WebView / Chrome，或先在系统浏览器学习。")
                .setPositiveButton("系统浏览器", (d, w) -> openExternal(Uri.parse(currentUrl())))
                .setNeutralButton("系统应用设置", (d, w) -> { try { startActivity(new Intent(Settings.ACTION_APPLICATION_SETTINGS)); } catch (ActivityNotFoundException ignored) {} })
                .setNegativeButton("暂时继续", null).show();
    }
    private void showMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.getMenu().add(0, 1, 1, "重新加载页面"); menu.getMenu().add(0, 2, 2, "用系统浏览器打开");
        menu.getMenu().add(0, 3, 3, "分享学习链接"); menu.getMenu().add(0, 4, 4, "系统英语语音设置");
        menu.getMenu().add(0, 6, 5, "检查更新"); menu.getMenu().add(0, 5, 6, "关于与数据说明");
        menu.setOnMenuItemClickListener(item -> {
            switch (item.getItemId()) {
                case 1: new AlertDialog.Builder(this).setTitle("重新加载？").setMessage("正在处理的任务或尚未保存的输入可能中断。确定重新加载当前页面吗？").setPositiveButton("重新加载", (d,w) -> { stopSpeech("朗读已停止。"); if (web == null) loadHomeOrRetry(); else web.reload(); }).setNegativeButton("取消", null).show(); break;
                case 2: openExternal(Uri.parse(currentUrl())); break;
                case 3: Intent share = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, "拾词 LexiGo · 英语学习").putExtra(Intent.EXTRA_TEXT, "拾词 LexiGo：小学与高中英语学习\n" + currentUrl()); try { startActivity(Intent.createChooser(share, "分享学习链接")); } catch (ActivityNotFoundException e) { toast("没有可用的分享应用。"); } break;
                case 4: openSpeechSettings(); break;
                case 6: appUpdate.check(); break;
                case 5: new AlertDialog.Builder(this).setTitle("拾词 LexiGo 安卓版").setMessage("小学三至六年级与高中英语学习。\n\n此版本需要联网，AI 功能由网站服务器提供。学习记录保存在本机应用中，与系统浏览器独立；卸载或清除应用数据会删除记录，请先在页面导出备份。\n\n朗读使用设备安装的英语语音。导入仅访问你通过系统选择器选中的文件，导出会让你选择保存位置。").setPositiveButton("知道了", null).show(); break;
                default: return false;
            }
            return true;
        }); menu.show();
    }
    private void navigateBack() {
        if (web != null && web.canGoBack()) { stopSpeech("朗读已停止。"); web.goBack(); }
        else new AlertDialog.Builder(this).setTitle("退出学习？").setMessage("尚未保存的输入可能丢失。你可以取消，先完成或导出当前学习内容。").setPositiveButton("退出", (d,w) -> finish()).setNegativeButton("继续学习", null).show();
    }
    @Override public void onBackPressed() { navigateBack(); }

    private void receive(WebMessageCompat message, JavaScriptReplyProxy proxy) {
        if (message.getType() != WebMessageCompat.TYPE_STRING) return;
        String raw = message.getData(); if (raw == null || raw.length() > MAX_MESSAGE_CHARS) return;
        Reply reply = null;
        try {
            JSONObject envelope = new JSONObject(raw);
            Object rawId = envelope.opt("id");
            if (!(rawId instanceof String) || !((String)rawId).matches("[A-Za-z0-9_.:-]{1,128}")) return;
            String id = (String)rawId;
            if (requests.contains(id) || requests.size() >= 24) return;
            reply = new Reply(id, proxy, pageEpoch); requests.add(id);
            String method = envelope.optString("method", "");
            JSONObject payload = envelope.optJSONObject("payload"); if (payload == null) payload = new JSONObject();
            switch (method) {
                case "ttsStatus": if (!ttsInitFinished) waitingStatus.add(reply); else reply(reply, speechStatus(), null); break;
                case "speak": speak(reply, payload); break;
                case "stopSpeech": stopSpeech("朗读已取消。"); reply(reply, true, null); break;
                case "saveText": saveText(reply, payload); break;
                case "speechSettings": reply(reply, openSpeechSettings(), null); break;
                default: reply(reply, null, "不支持的原生操作。");
            }
        } catch (Exception e) { if (reply != null) reply(reply, null, "请求格式不正确，无法执行。"); }
    }
    private void reply(Reply request, Object result, String error) {
        if (request == null || request.complete) return;
        request.complete = true;
        if (request.epoch != pageEpoch) return;
        requests.remove(request.id);
        if (destroyed || web == null || !trusted(web.getUrl())) return;
        try {
            JSONObject value = new JSONObject().put("id", request.id).put("ok", error == null);
            if (error == null) value.put("result", result == null ? JSONObject.NULL : result);
            else value.put("error", error.substring(0, Math.min(error.length(), 300)));
            request.proxy.postMessage(value.toString());
        } catch (RuntimeException | JSONException ignored) { /* The originating document may have gone away. */ }
    }

    private void initializeSpeech() {
        final int generation = ++speechGeneration;
        ttsInitialized = false; ttsInitFinished = false; ttsError = "英语语音正在准备，请稍后再试。";
        try {
            tts = new TextToSpeech(getApplicationContext(), status -> main.post(() -> {
                if (destroyed || generation != speechGeneration) return;
                ttsInitFinished = true; ttsInitialized = status == TextToSpeech.SUCCESS;
                ttsError = ttsInitialized ? "" : "系统朗读服务未能启动，请在系统语音设置中检查英语语音。";
                if (ttsInitialized) {
                    tts.setAudioAttributes(new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH).build());
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String id) {}
                        @Override public void onDone(String id) { main.post(() -> finishSpeech(id, null)); }
                        @Override public void onError(String id) { main.post(() -> finishSpeech(id, "系统朗读失败，请检查英语语音和设备音量。")); }
                        @Override public void onError(String id, int code) { main.post(() -> finishSpeech(id, "系统朗读失败，请检查英语语音或网络（代码 " + code + "）。")); }
                        @Override public void onStop(String id, boolean interrupted) { main.post(() -> finishSpeech(id, "朗读已取消。")); }
                    });
                }
                flushSpeechStatus();
            }));
        } catch (RuntimeException e) { ttsInitFinished = true; ttsError = "此设备暂时没有可用的系统朗读服务。"; flushSpeechStatus(); }
        main.postDelayed(() -> {
            if (!destroyed && generation == speechGeneration && !ttsInitFinished) { ttsInitFinished = true; ttsError = "系统语音初始化超时，请检查语音设置后再试。"; flushSpeechStatus(); }
        }, 12000);
    }
    private List<Voice> englishVoices() {
        List<Voice> result = new ArrayList<>();
        if (!ttsInitialized || tts == null) return result;
        try {
            Set<Voice> voices = tts.getVoices();
            if (voices != null) for (Voice voice : voices) {
                if (voice != null && voice.getLocale() != null && "en".equalsIgnoreCase(voice.getLocale().getLanguage())
                        && (voice.getFeatures() == null || !voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))) result.add(voice);
            }
            result.sort((a,b) -> a.getName().compareTo(b.getName()));
        } catch (RuntimeException ignored) { result.clear(); }
        return result;
    }
    private JSONObject speechStatus() {
        JSONObject status = new JSONObject(); JSONArray voices = new JSONArray(); List<Voice> available = englishVoices();
        try {
            Voice defaultVoice = ttsInitialized && tts != null ? tts.getDefaultVoice() : null;
            for (Voice voice : available) voices.put(new JSONObject().put("name", voice.getName()).put("lang", voice.getLocale().toLanguageTag()).put("localService", !voice.isNetworkConnectionRequired()).put("default", defaultVoice != null && defaultVoice.getName().equals(voice.getName())));
            status.put("ready", ttsInitialized && !available.isEmpty()).put("voices", voices);
            if (!ttsInitialized || available.isEmpty()) status.put("error", ttsError.isEmpty() ? "未找到可用的英语语音，请在系统语音设置中添加。" : ttsError);
        } catch (RuntimeException | JSONException ignored) {}
        return status;
    }
    private void flushSpeechStatus() {
        List<Reply> copy = new ArrayList<>(waitingStatus); waitingStatus.clear();
        JSONObject status = speechStatus(); for (Reply r : copy) reply(r, status, null);
        // Initialization/voice-settings completion only: status requests must not emit recursively.
        if (!destroyed && web != null && trusted(web.getUrl())) web.evaluateJavascript("window.dispatchEvent(new Event('lexigo:tts-ready'))", null);
    }
    private void speak(Reply request, JSONObject payload) {
        if (background) { reply(request, null, "请回到学习页面后再朗读。"); return; }
        if (!ttsInitialized || tts == null) { reply(request, null, ttsError); return; }
        Object rawText = payload.opt("text"); String text = rawText instanceof String ? ((String)rawText).trim() : "";
        if (text.isEmpty() || text.length() > Math.min(4000, TextToSpeech.getMaxSpeechInputLength())) { reply(request, null, "朗读文字为空或过长，请分段朗读。"); return; }
        String lang = payload.optString("lang", "en-US"), name = payload.optString("voice", "");
        double rate = payload.optDouble("rate", 1);
        if (!lang.matches("(?i)en(?:-[a-z0-9]{2,8}){0,3}") || name.length() > 300 || !Double.isFinite(rate)) { reply(request, null, "英语朗读参数无效。"); return; }
        List<Voice> voices = englishVoices(); Voice selected = null;
        if (!name.isEmpty()) for (Voice v : voices) if (name.equals(v.getName())) { selected = v; break; }
        if (!name.isEmpty() && selected == null) { reply(request, null, "所选英语音色已不可用，请重新选择。"); return; }
        if (selected == null) for (Voice v : voices) if (v.getLocale().toLanguageTag().equalsIgnoreCase(lang) && !v.isNetworkConnectionRequired()) { selected = v; break; }
        if (selected == null) for (Voice v : voices) if (v.getLocale().toLanguageTag().equalsIgnoreCase(lang)) { selected = v; break; }
        if (selected == null && !voices.isEmpty()) selected = voices.get(0);
        if (selected == null) { reply(request, null, "设备没有可用的英语语音，请先到系统设置添加。"); return; }
        stopSpeech("朗读已被新的播放替换。");
        try {
            float speed = (float)Math.max(.5, Math.min(2, rate));
            if (tts.setVoice(selected) != TextToSpeech.SUCCESS || tts.setSpeechRate(speed) != TextToSpeech.SUCCESS) { reply(request, null, "系统无法使用所选英语音色。"); return; }
            speechReply = request; utterance = UUID.randomUUID().toString(); final String current = utterance;
            speechTimeout = () -> { if (current.equals(utterance)) stopSpeech("朗读等待超时，请检查系统语音服务后重试。"); };
            main.postDelayed(speechTimeout, Math.min(600000L, Math.max(20000L, (long)(15000 + text.length() * 250 / speed))));
            if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, new Bundle(), utterance) != TextToSpeech.SUCCESS) finishSpeech(current, "系统未能开始朗读，请稍后再试。");
        } catch (RuntimeException e) { if (speechReply == request) finishSpeech(utterance, "系统朗读服务不可用。"); else reply(request, null, "系统朗读服务不可用。"); }
    }
    private void finishSpeech(String id, String error) {
        if (id == null || !id.equals(utterance) || speechReply == null) return;
        Reply done = speechReply; speechReply = null; utterance = null;
        if (speechTimeout != null) main.removeCallbacks(speechTimeout); speechTimeout = null;
        reply(done, true, error);
    }
    private void stopSpeech(String reason) {
        String id = utterance; if (id != null) finishSpeech(id, reason);
        if (tts != null) try { tts.stop(); } catch (RuntimeException ignored) {}
    }
    private boolean openSpeechSettings() {
        stopSpeech("已打开系统语音设置。");
        Intent intent = new Intent("com.android.settings.TTS_SETTINGS");
        try { visitedSettings = true; startActivity(intent); return true; }
        catch (ActivityNotFoundException e) {
            try { startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); toast("请在系统设置里查找文字转语音或英语语音。"); return true; }
            catch (ActivityNotFoundException ignored) { visitedSettings = false; toast("请手动打开系统设置中的文字转语音选项。"); return false; }
        }
    }

    private boolean showFiles(WebView view, ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (background || chooser != null || !trusted(view.getUrl()) || params.getMode() == WebChromeClient.FileChooserParams.MODE_SAVE || save != null) { callback.onReceiveValue(null); return true; }
        chooser = callback; chooserTypes = acceptedTypes(params.getAcceptTypes());
        if (chooserTypes.isEmpty()) { toast("支持选择 JPG、PNG、WebP 图片或 JSON 学习备份。"); finishChooser(null); return true; }
        chooserLimit = params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE ? 3 : 1;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(chooserTypes.size() == 1 ? chooserTypes.iterator().next() : "*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, chooserTypes.toArray(new String[0])); intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, chooserLimit > 1); intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { startActivityForResult(intent, PICK_FILES); }
        catch (ActivityNotFoundException e) { toast("设备没有可用的文件选择器。"); finishChooser(null); }
        return true;
    }
    static Set<String> acceptedTypes(String[] supplied) {
        Set<String> result = new LinkedHashSet<>(); boolean any = supplied == null || supplied.length == 0;
        if (supplied != null) for (String group : supplied) {
            if (group == null || group.trim().isEmpty() || group.trim().equals("*/*")) { any = true; continue; }
            for (String raw : group.split(",")) {
                String t = raw.trim().toLowerCase(Locale.ROOT);
                if (t.equals("image/*")) { result.add("image/jpeg"); result.add("image/png"); result.add("image/webp"); }
                else if (t.equals(".jpg") || t.equals(".jpeg") || t.equals("image/jpeg")) result.add("image/jpeg");
                else if (t.equals(".png") || t.equals("image/png")) result.add("image/png");
                else if (t.equals(".webp") || t.equals("image/webp")) result.add("image/webp");
                else if (t.equals(".json") || t.equals("application/json") || t.equals("text/plain")) { result.add("application/json"); result.add("text/plain"); }
            }
        }
        if (any) { result.add("image/jpeg"); result.add("image/png"); result.add("image/webp"); result.add("application/json"); result.add("text/plain"); }
        return result;
    }
    private boolean validContent(Uri uri) {
        if (uri == null || !"content".equalsIgnoreCase(uri.getScheme()) || uri.getAuthority() == null || uri.getUserInfo() != null || uri.getFragment() != null) return false;
        String authority = uri.getAuthority().toLowerCase(Locale.ROOT), path = uri.getPath();
        if (authority.equals(getPackageName()) || authority.startsWith(getPackageName() + ".")) return false;
        return path == null || (!path.contains("\u0000") && !path.contains("\\") && !path.matches(".*(?:^|/)\\.\\.(?:/|$).*"));
    }
    private boolean validPickedFile(Uri uri, Set<String> allowed) {
        if (!validContent(uri)) return false;
        String name = "", mime;
        long size = -1;
        try {
            mime = getContentResolver().getType(uri);
            try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME), si = c.getColumnIndex(OpenableColumns.SIZE);
                    if (ni >= 0) name = c.getString(ni);
                    if (si >= 0 && !c.isNull(si)) size = c.getLong(si);
                }
            }
            if (size > MAX_EXPORT_BYTES || size == 0) return false;
            mime = mime == null ? "" : mime.split(";", 2)[0].toLowerCase(Locale.ROOT);
            if ((mime.isEmpty() || mime.equals("application/octet-stream")) && name != null && name.toLowerCase(Locale.ROOT).endsWith(".json")) mime = "application/json";
            if (!allowed.contains(mime)) return false;
            // Providers can omit or misreport SIZE. Check the actual bounded stream off the UI thread.
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                if (in == null) return false;
                byte[] buffer = new byte[32768]; long total = 0; int read;
                while ((read = in.read(buffer)) != -1) {
                    if (Thread.currentThread().isInterrupted()) return false;
                    total += read; if (total > MAX_EXPORT_BYTES) return false;
                }
                return total > 0;
            }
        } catch (Exception e) { return false; }
    }
    private void finishChooser(Uri[] uris) {
        ValueCallback<Uri[]> done = chooser; chooser = null; chooserTypes = Collections.emptySet(); chooserLimit = 1;
        if (done != null) done.onReceiveValue(uris);
    }
    private void saveText(Reply request, JSONObject payload) {
        if (background || save != null || chooser != null) { reply(request, null, "请先完成当前文件选择，再尝试导出。"); return; }
        Object raw = payload.opt("content");
        if (!(raw instanceof String) || ((String)raw).length() > MAX_EXPORT_BYTES) { reply(request, null, "导出内容无效或超过 20 MB。"); return; }
        String mime = payload.optString("mime", "text/plain").split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        if (!mime.equals("application/json") && !mime.equals("text/plain") && !mime.equals("text/html") && !mime.equals("text/csv")) { reply(request, null, "不支持此导出文件类型。"); return; }
        byte[] bytes = ((String)raw).getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_EXPORT_BYTES) { reply(request, null, "导出内容超过 20 MB，请减少内容后再试。"); return; }
        String name = payload.optString("filename", "lexigo.txt").replaceAll("[\\p{Cntrl}\\\\/:*?\"<>|]", "_").trim();
        if (name.isEmpty() || name.equals(".") || name.equals("..")) name = "lexigo.txt";
        if (name.length() > 120) name = name.substring(name.length() - 120);
        save = new SaveOperation(request, name, bytes);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, name).addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try { startActivityForResult(intent, SAVE_TEXT); }
        catch (ActivityNotFoundException e) { save = null; reply(request, null, "设备没有可用的保存文件选择器。"); }
    }
    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == AppUpdate.ALLOW_INSTALL) {
            appUpdate.settingsReturned();
        } else if (code == PICK_FILES) {
            if (chooser == null) return;
            if (result != RESULT_OK || data == null) { finishChooser(null); return; }
            Set<Uri> picked = new LinkedHashSet<>(); ClipData clip = data.getClipData();
            if (clip != null) { if (clip.getItemCount() > chooserLimit) { toast("一次最多选择 " + chooserLimit + " 个文件。"); finishChooser(null); return; } for (int i = 0; i < clip.getItemCount(); i++) picked.add(clip.getItemAt(i).getUri()); }
            else if (data.getData() != null) picked.add(data.getData());
            if (picked.isEmpty() || picked.size() > chooserLimit) { finishChooser(null); return; }
            final ValueCallback<Uri[]> expected = chooser;
            final Set<String> allowed = new HashSet<>(chooserTypes);
            final long epoch = pageEpoch;
            toast("正在读取所选文件…");
            files.execute(() -> {
                boolean valid = true;
                for (Uri uri : picked) if (!validPickedFile(uri, allowed)) { valid = false; break; }
                final boolean accepted = valid;
                main.post(() -> {
                    if (destroyed || chooser != expected || pageEpoch != epoch) return;
                    if (!accepted) toast("所选文件不可读取、格式不支持或超过 20 MB。请选择 JPG、PNG、WebP 图片或 JSON 备份。");
                    finishChooser(accepted ? picked.toArray(new Uri[0]) : null);
                });
            });
        } else if (code == SAVE_TEXT) {
            SaveOperation operation = save;
            if (operation == null) return;
            if (result != RESULT_OK || data == null || data.getData() == null) { save = null; reply(operation.reply, null, "已取消保存，未导出文件。"); return; }
            Uri destination = data.getData();
            if (!validContent(destination)) { save = null; reply(operation.reply, null, "保存位置不是受支持的系统文档地址。"); return; }
            files.execute(() -> {
                String failure = null;
                try (OutputStream out = getContentResolver().openOutputStream(destination, "w")) {
                    if (out == null) throw new java.io.IOException();
                    for (int offset = 0; offset < operation.bytes.length; offset += 32768) {
                        if (operation.cancelled || Thread.currentThread().isInterrupted()) throw new java.io.InterruptedIOException();
                        out.write(operation.bytes, offset, Math.min(32768, operation.bytes.length - offset));
                    }
                    out.flush();
                } catch (Exception e) { failure = "未能完整保存文件，请检查剩余空间或重新选择位置。"; }
                final String error = failure;
                main.post(() -> {
                    if (save != operation) return;
                    save = null;
                    if (error != null) reply(operation.reply, null, error);
                    else try { reply(operation.reply, new JSONObject().put("saved", true).put("filename", operation.name), null); } catch (JSONException ignored) {}
                });
            });
        }
    }

    private void cancelPageRequests() {
        stopSpeech("页面已更换，朗读已停止。"); finishChooser(null);
        if (save != null) { save.cancelled = true; reply(save.reply, null, "页面已更换，保存已取消。"); save = null; }
        waitingStatus.clear(); requests.clear();
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        if (web != null && trusted(web.getUrl())) { Bundle saved = new Bundle(); web.saveState(saved); state.putBundle("web", saved); }
        super.onSaveInstanceState(state);
    }
    @Override public void onConfigurationChanged(Configuration config) { super.onConfigurationChanged(config); if (content != null) content.requestApplyInsets(); }
    @Override protected void onResume() {
        super.onResume(); background = false;
        if (web != null) { web.resumeTimers(); web.onResume(); }
        if (visitedSettings) { visitedSettings = false; if (tts != null) tts.shutdown(); initializeSpeech(); }
    }
    @Override protected void onPause() {
        background = true; stopSpeech("应用已暂停，朗读已停止。");
        if (web != null) {
            if (trusted(web.getUrl())) web.evaluateJavascript("document.querySelectorAll('audio,video').forEach(function(m){m.pause()});if(window.speechSynthesis){window.speechSynthesis.cancel()}", null);
            web.onPause(); web.pauseTimers();
        }
        CookieManager.getInstance().flush(); super.onPause();
    }
    @Override protected void onDestroy() {
        appUpdate.close();
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        cancelPageRequests(); destroyed = true; main.removeCallbacksAndMessages(null); files.shutdownNow();
        if (tts != null) { tts.shutdown(); tts = null; }
        if (web != null) { content.removeView(web); web.stopLoading(); web.destroy(); web = null; }
        super.onDestroy();
    }
}
