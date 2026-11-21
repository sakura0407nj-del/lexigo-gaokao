package app.lexigo.learning;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import org.junit.Test;

/** Pure MIME policy checks: no device, Android framework calls or broad picker permissions. */
public final class MainActivityPolicyTest {
    private static Set<String> types(String... values) { return new HashSet<>(Arrays.asList(values)); }

    @Test public void imageWildcardOnlyAllowsTheThreeSupportedRasterFormats() {
        assertEquals(types("image/jpeg", "image/png", "image/webp"),
                MainActivity.acceptedTypes(new String[]{"image/*"}));
    }

    @Test public void jsonAcceptsProviderPlainTextFallbackWithoutOtherDocumentTypes() {
        assertEquals(types("application/json", "text/plain"),
                MainActivity.acceptedTypes(new String[]{".json", "application/json"}));
    }

    @Test public void commaSeparatedExtensionsNormalizeAndDeduplicate() {
        assertEquals(types("image/jpeg", "image/png", "image/webp"),
                MainActivity.acceptedTypes(new String[]{" .JPG, .jpeg, IMAGE/PNG ", ".webp", "image/png"}));
    }

    @Test public void unsafeOrUnsupportedTypesCannotWidenThePickerAllowlist() {
        assertTrue(MainActivity.acceptedTypes(new String[]{
                "image/svg+xml", "text/html", "application/vnd.android.package-archive", "application/pdf"
        }).isEmpty());
        Set<String> wildcard = MainActivity.acceptedTypes(new String[]{"*/*"});
        assertEquals(types("image/jpeg", "image/png", "image/webp", "application/json", "text/plain"), wildcard);
        assertFalse(wildcard.contains("*/*"));
    }
}
