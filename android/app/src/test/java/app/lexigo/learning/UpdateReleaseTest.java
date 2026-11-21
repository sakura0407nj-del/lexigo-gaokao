package app.lexigo.learning;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.net.URL;

import org.junit.Test;

public final class UpdateReleaseTest {
    private static final String DIGEST = "EF".repeat(32);
    private static final String ASSET = "android-update.json";

    @Test public void versionCodeControlsUpdatesAndPinnedAssetIsDerived() throws Exception {
        UpdateRelease release = new UpdateRelease(1, UpdateRelease.PACKAGE, "1.10.0", 10, 26, 1000, DIGEST);
        assertTrue(release.isNewerThan(9));
        assertFalse(release.isNewerThan(10));
        assertFalse(release.isNewerThan(11));
        assertEquals(DIGEST.toLowerCase(java.util.Locale.ROOT), release.sha256);
        assertEquals("lexigo-1.10.0.apk", release.fileName());
        assertTrue(UpdateRelease.permittedUrl(new URL(release.downloadUrl()), release.fileName()));
    }

    @Test public void onlyOfficialReleaseAndHttpsAssetHostsAreAccepted() throws Exception {
        assertTrue(UpdateRelease.permittedUrl(new URL(UpdateRelease.FEED), ASSET));
        assertTrue(UpdateRelease.permittedUrl(new URL(UpdateRelease.FEED.replace("latest/download", "download/android-v1.0.2")), ASSET));
        assertTrue(UpdateRelease.permittedUrl(new URL("https://release-assets.githubusercontent.com/assets/file?sig=test"), ASSET));
        assertFalse(UpdateRelease.permittedUrl(new URL(UpdateRelease.FEED.replace("https:", "http:")), ASSET));
        assertFalse(UpdateRelease.permittedUrl(new URL(UpdateRelease.FEED.replace("github.com", "github.com:8080")), ASSET));
        assertFalse(UpdateRelease.permittedUrl(new URL(UpdateRelease.FEED.replace("github.com", "user@github.com")), ASSET));
        assertFalse(UpdateRelease.permittedUrl(new URL(UpdateRelease.FEED.replace("lexigo-gaokao", "different-project")), ASSET));
        assertFalse(UpdateRelease.permittedUrl(new URL("https://release-assets.githubusercontent.com.example.net/file"), ASSET));
        assertFalse(UpdateRelease.permittedUrl(new URL(UpdateRelease.FEED), "different.apk"));
    }

    @Test public void invalidVersionPackageSizeAndChecksumFailClosed() {
        assertThrows(IOException.class, () -> new UpdateRelease(2, UpdateRelease.PACKAGE, "1.0.2", 3, 26, 1000, DIGEST));
        assertThrows(IOException.class, () -> new UpdateRelease(1, "app.other", "1.0.2", 3, 26, 1000, DIGEST));
        assertThrows(IOException.class, () -> new UpdateRelease(1, UpdateRelease.PACKAGE, "../payload", 3, 26, 1000, DIGEST));
        assertThrows(IOException.class, () -> new UpdateRelease(1, UpdateRelease.PACKAGE, "1.0.2", 0, 26, 1000, DIGEST));
        assertThrows(IOException.class, () -> new UpdateRelease(1, UpdateRelease.PACKAGE, "1.0.2", 3, 25, 1000, DIGEST));
        assertThrows(IOException.class, () -> new UpdateRelease(1, UpdateRelease.PACKAGE, "1.0.2", 3, 26, UpdateRelease.MAX_BYTES + 1, DIGEST));
        assertThrows(IOException.class, () -> new UpdateRelease(1, UpdateRelease.PACKAGE, "1.0.2", 3, 26, 1000, "invalid"));
    }
}
