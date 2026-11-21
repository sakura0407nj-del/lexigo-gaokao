package app.lexigo.learning;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/** Manual updates from the official release feed. The Android installer confirms installation. */
final class AppUpdate {
    static final int ALLOW_INSTALL = 7003;
    private static final int FEED_LIMIT = 16 * 1024;
    private static final String APK_TYPE = "application/vnd.android.package-archive";
    private final Activity activity;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private Operation running;
    private File pendingPermission;
    private boolean closed;

    private static final class Operation {
        AlertDialog dialog;
        Future<?> future;
        volatile boolean cancelled;

        void checkCancelled() throws InterruptedIOException {
            if (cancelled || Thread.currentThread().isInterrupted()) throw new InterruptedIOException();
        }
    }

    private interface Work {
        Runnable run(Operation operation) throws Exception;
    }

    AppUpdate(Activity activity) { this.activity = activity; }

    void check() {
        start("检查更新", "正在检查安卓安装包…", "暂时无法检查更新，请检查网络后重试。", operation -> {
            UpdateRelease latest = loadRelease(operation);
            PackageInfo current = installed();
            return () -> showRelease(latest, current);
        });
    }

    private void showRelease(UpdateRelease release, PackageInfo installed) {
        String current = "当前版本 " + installed.versionName;
        if (!release.isNewerThan(code(installed))) {
            new AlertDialog.Builder(activity).setTitle("已是最新版").setMessage(current).setPositiveButton("确定", null).show();
            return;
        }
        if (release.minSdk > Build.VERSION.SDK_INT) {
            new AlertDialog.Builder(activity).setTitle("发现新版 " + release.version)
                    .setMessage(current + "\n新版需要更高版本的 Android。").setPositiveButton("确定", null).show();
            return;
        }
        String size = String.format(Locale.ROOT, "%.1f MB", release.bytes / (1024.0 * 1024.0));
        new AlertDialog.Builder(activity).setTitle("发现新版 " + release.version).setMessage(current + "\n安装包大小 " + size)
                .setPositiveButton("下载更新", (d, which) -> download(release))
                .setNegativeButton("稍后", null).show();
    }

    private void download(UpdateRelease release) {
        start("正在下载更新", "正在连接下载地址…", "下载失败或安装包未通过校验，请检查网络后重试。", operation -> {
            File apk = verifiedDownload(release, operation);
            return () -> new AlertDialog.Builder(activity).setTitle("更新包已校验")
                    .setMessage("安装 " + release.version + " 将覆盖当前版本，保留本机学习记录。")
                    .setPositiveButton("去安装", (d, which) -> requestInstall(apk))
                    .setNegativeButton("稍后", null).show();
        });
    }

    private void start(String title, String message, String failure, Work work) {
        if (closed || running != null) return;
        Operation operation = new Operation();
        running = operation;
        operation.dialog = new AlertDialog.Builder(activity).setTitle(title).setMessage(message)
                .setNegativeButton("取消", (d, which) -> cancel(operation)).create();
        operation.dialog.setOnCancelListener(d -> cancel(operation));
        operation.dialog.setCanceledOnTouchOutside(false);
        operation.dialog.show();
        operation.future = worker.submit(() -> {
            Runnable result;
            try { result = work.run(operation); }
            catch (Exception error) {
                result = () -> notice("更新未完成", failure);
            }
            Runnable showResult = result;
            activity.runOnUiThread(() -> {
                if (closed || running != operation) return;
                running = null;
                operation.dialog.dismiss();
                showResult.run();
            });
        });
    }

    private void cancel(Operation operation) {
        if (running != operation) return;
        running = null;
        operation.cancelled = true;
        if (operation.future != null) operation.future.cancel(true);
    }

    private void notice(String title, String message) {
        new AlertDialog.Builder(activity).setTitle(title).setMessage(message).setPositiveButton("确定", null).show();
    }

    private static UpdateRelease loadRelease(Operation operation) throws Exception {
        HttpURLConnection conn = connect(UpdateRelease.FEED, "android-update.json", operation);
        try (InputStream in = conn.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            for (int count; (count = in.read(buffer)) != -1;) {
                operation.checkCancelled();
                if (out.size() + count > FEED_LIMIT) throw new IOException("Release feed is too large");
                out.write(buffer, 0, count);
            }
            JSONObject data = new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
            return new UpdateRelease(data.getInt("schema"), data.getString("packageName"), data.getString("versionName"),
                    data.getLong("versionCode"), data.getInt("minSdk"), data.getLong("bytes"), data.getString("sha256"));
        } finally { conn.disconnect(); }
    }

    private File verifiedDownload(UpdateRelease release, Operation operation) throws Exception {
        File directory = new File(activity.getCacheDir(), "verified-updates");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create updates directory");
        File target = new File(directory, release.fileName());
        if (matchesDigest(target, release, operation)) {
            verifyApk(target, release);
            return target;
        }
        File partial = File.createTempFile("lexigo-update-", ".apk", activity.getCacheDir());
        try {
            fetchApk(release, partial, operation);
            verifyApk(partial, release);
            operation.checkCancelled();
            if (!partial.renameTo(target)) throw new IOException("Cannot prepare verified APK");
            File[] files = directory.listFiles();
            if (files != null) for (File old : files) {
                if (!old.equals(target) && old.getName().matches("lexigo-[0-9.]+\\.apk")) old.delete();
            }
            return target;
        } finally {
            if (partial.exists()) partial.delete();
        }
    }

    private void fetchApk(UpdateRelease release, File partial, Operation operation) throws Exception {
        HttpURLConnection conn = connect(release.downloadUrl(), release.fileName(), operation);
        try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(partial)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[65536];
            long received = 0;
            int shown = -10;
            for (int count; (count = in.read(buffer)) != -1;) {
                operation.checkCancelled();
                received += count;
                if (received > release.bytes) throw new IOException("Unexpected APK size");
                digest.update(buffer, 0, count);
                out.write(buffer, 0, count);
                int percent = (int) (received * 100 / release.bytes);
                if (percent == 100 || percent >= shown + 5) {
                    shown = percent;
                    activity.runOnUiThread(() -> {
                        if (running == operation) operation.dialog.setMessage(percent == 100 ? "正在校验安装包…" : "已下载 " + percent + "%");
                    });
                }
            }
            if (received != release.bytes || !hex(digest.digest()).equals(release.sha256)) throw new IOException("APK checksum mismatch");
        } finally { conn.disconnect(); }
    }

    private static HttpURLConnection connect(String address, String asset, Operation operation) throws IOException {
        URL url = new URL(address);
        for (int count = 0; count < 5; count++) {
            operation.checkCancelled();
            if (!UpdateRelease.permittedUrl(url, asset)) throw new IOException("Untrusted update address");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(12000);
            conn.setReadTimeout(15000);
            conn.setUseCaches(false);
            conn.setRequestProperty("User-Agent", "LexiGo-Android-Update");
            conn.setRequestProperty("Accept-Encoding", "identity");
            try {
                int status = conn.getResponseCode();
                if (status == 200) return conn;
                String destination = conn.getHeaderField("Location");
                if ((status != 301 && status != 302 && status != 303 && status != 307 && status != 308) || destination == null) {
                    throw new IOException("Update HTTP " + status);
                }
                url = new URL(url, destination);
            } catch (IOException error) {
                conn.disconnect();
                throw error;
            }
            conn.disconnect();
        }
        throw new IOException("Too many update redirects");
    }

    private static boolean matchesDigest(File file, UpdateRelease release, Operation operation) throws Exception {
        if (!file.isFile() || file.length() != release.bytes) return false;
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[65536];
            for (int count; (count = in.read(buffer)) != -1;) {
                operation.checkCancelled();
                digest.update(buffer, 0, count);
            }
        }
        return hex(digest.digest()).equals(release.sha256);
    }

    private static String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) value.append(Character.forDigit((b >>> 4) & 15, 16)).append(Character.forDigit(b & 15, 16));
        return value.toString();
    }

    private void verifyApk(File file, UpdateRelease release) throws Exception {
        PackageInfo active = installed();
        PackageInfo archive = activity.getPackageManager().getPackageArchiveInfo(file.getAbsolutePath(), signingFlag());
        if (archive == null || !active.packageName.equals(archive.packageName) || !release.version.equals(archive.versionName) ||
                code(archive) != release.versionCode || !release.isNewerThan(code(active)) ||
                archive.applicationInfo == null || archive.applicationInfo.minSdkVersion > Build.VERSION.SDK_INT) {
            throw new IOException("APK package or version mismatch");
        }
        Signature[] ours = signatures(active);
        Signature[] theirs = signatures(archive);
        if (ours == null || theirs == null || ours.length != 1 || theirs.length != 1 || !ours[0].equals(theirs[0])) {
            throw new IOException("APK signer mismatch");
        }
    }

    private PackageInfo installed() throws PackageManager.NameNotFoundException {
        return activity.getPackageManager().getPackageInfo(activity.getPackageName(), signingFlag());
    }

    private static long code(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }

    private static int signingFlag() {
        return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
    }

    private static Signature[] signatures(PackageInfo info) {
        if (Build.VERSION.SDK_INT < 28) return info.signatures;
        return info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
    }

    private void requestInstall(File apk) {
        if (!apk.isFile()) {
            notice("请重新下载", "系统已清理缓存中的安装包。");
            return;
        }
        if (activity.getPackageManager().canRequestPackageInstalls()) {
            launchInstaller(apk);
            return;
        }
        new AlertDialog.Builder(activity).setTitle("允许拾词安装更新")
                .setMessage("首次安装时，请在安卓设置中打开「允许来自此来源的应用」。返回后由系统安装器确认。")
                .setPositiveButton("打开设置", (d, which) -> {
                    pendingPermission = apk;
                    Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName()));
                    try { activity.startActivityForResult(settings, ALLOW_INSTALL); }
                    catch (ActivityNotFoundException | SecurityException error) {
                        pendingPermission = null;
                        notice("无法打开安装设置", "请在系统设置里找到拾词的「安装未知应用」选项。");
                    }
                }).setNegativeButton("取消", null).show();
    }

    void settingsReturned() {
        File apk = pendingPermission;
        pendingPermission = null;
        if (!closed && apk != null && activity.getPackageManager().canRequestPackageInstalls()) requestInstall(apk);
    }

    private void launchInstaller(File apk) {
        try {
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".updates", apk);
            Intent install = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, APK_TYPE)
                    .setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            install.setClipData(ClipData.newRawUri("LexiGo update", uri));
            activity.startActivity(install);
        } catch (ActivityNotFoundException | SecurityException | IllegalArgumentException error) {
            notice("无法启动安装器", "请检查设备是否允许通过拾词安装应用，然后重试。");
        }
    }

    void close() {
        closed = true;
        pendingPermission = null;
        if (running != null) {
            running.dialog.dismiss();
            cancel(running);
        }
        worker.shutdownNow();
    }
}
