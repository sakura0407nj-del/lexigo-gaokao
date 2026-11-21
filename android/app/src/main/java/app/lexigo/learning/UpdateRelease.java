package app.lexigo.learning;

import java.io.IOException;
import java.net.URL;
import java.util.Locale;

/** Stable release feed and validation shared by the check and download steps. */
final class UpdateRelease {
    static final String PACKAGE = "app.lexigo.learning";
    private static final String REPOSITORY = "/sakura0407nj-del/lexigo-gaokao/releases/";
    private static final String VERSION = "[0-9]{1,6}(?:\\.[0-9]{1,6}){2}";
    static final String FEED = "https://github.com" + REPOSITORY + "latest/download/android-update.json";
    static final long MAX_BYTES = 64L * 1024 * 1024;

    final String version;
    final long versionCode;
    final int minSdk;
    final long bytes;
    final String sha256;

    UpdateRelease(int schema, String packageName, String version, long versionCode, int minSdk, long bytes, String sha256) throws IOException {
        if (schema != 1 || !PACKAGE.equals(packageName) || version == null || !version.matches(VERSION) ||
                versionCode < 1 || minSdk < 26 || bytes < 1 || bytes > MAX_BYTES || sha256 == null || !sha256.matches("[a-fA-F0-9]{64}")) {
            throw new IOException("Invalid Android release manifest");
        }
        this.version = version;
        this.versionCode = versionCode;
        this.minSdk = minSdk;
        this.bytes = bytes;
        this.sha256 = sha256.toLowerCase(Locale.ROOT);
    }

    boolean isNewerThan(long installedCode) { return versionCode > installedCode; }

    String fileName() { return "lexigo-" + version + ".apk"; }

    String downloadUrl() { return "https://github.com" + REPOSITORY + "download/android-v" + version + "/" + fileName(); }

    static boolean permittedUrl(URL url, String asset) {
        if (!"https".equalsIgnoreCase(url.getProtocol()) || url.getUserInfo() != null || url.getRef() != null ||
                (url.getPort() != -1 && url.getPort() != 443)) return false;
        String host = url.getHost().toLowerCase(Locale.ROOT);
        if ("github.com".equals(host)) {
            if (!url.getPath().startsWith(REPOSITORY) || url.getQuery() != null) return false;
            String file = java.util.regex.Pattern.quote(asset);
            return url.getPath().substring(REPOSITORY.length()).matches("(?:latest/download|download/android-v" + VERSION + ")/" + file);
        }
        return "release-assets.githubusercontent.com".equals(host) || "objects.githubusercontent.com".equals(host);
    }
}
