# 拾词 LexiGo Android

The application ID is `app.lexigo.learning`. Android 8.0 (API 26) or newer is required. The app opens the hosted HTTPS learning site in Android System WebView and requires an internet connection. Android System WebView and an English text-to-speech voice should be available on the device.

The manifest requests `INTERNET` and `REQUEST_INSTALL_PACKAGES`. The toolbar's **检查更新** action downloads an APK to private cache, validates its SHA-256, package, version and signer, and gives the Android installer a temporary read grant. Android asks for confirmation and may require permission to install from LexiGo the first time. Cleartext traffic and app backup are disabled. Provider keys and signing credentials belong outside the APK and repository.

## Build from source

Install JDK 17 and Android SDK Platform 35 / Build Tools 35.0.0. Set `ANDROID_HOME`, or create a local, ignored `local.properties` file containing your SDK path. From this directory:

```sh
./gradlew --no-daemon :app:lintRelease :app:testReleaseUnitTest :app:assembleRelease
```

On Windows use `gradlew.bat`. The output is `app/build/outputs/apk/release/app-release-unsigned.apk`. The unit-test task executes available JVM tests; when none are present Gradle reports `NO-SOURCE`.

The manual GitHub Actions workflow **Android APK** runs the same tasks, aligns the APK and uploads `lexigo-android-unsigned` plus lint/test reports. It never signs a release. The APK artifact also contains the official, platform-independent `tools/apksigner.jar`, its Build Tools version information and SHA-256 checksums. APKs in that artifact are already zipaligned, so local signing needs only JDK 17 and your existing release keystore, including on Windows.

## Local release signing

Keep the release keystore and its backup outside this repository. Reuse the same key for future app updates, and increase `versionCode`. Do not send key passwords in command arguments, commit keys or upload them to CI.

From the extracted artifact directory, sign using your private keystore path; `apksigner` prompts for its password:

```sh
java -jar tools/apksigner.jar sign --ks /private/path/lexigo-release.jks --ks-key-alias lexigo --out lexigo.apk lexigo-android-unsigned.apk
java -jar tools/apksigner.jar verify --verbose --print-certs lexigo.apk
```

Distribute only the verified signed APK. Do not modify or re-align an APK after signing it. A directly built local APK should be checked/aligned with SDK `zipalign` before signing; the workflow artifact has already completed this step.

For releases with in-app update support, use `node scripts/sign-android.mjs <aligned-apk> <apksigner.jar> <out>/lexigo-<version>.apk` from the repository root. This emits `android-update.json` alongside the signed APK. Check the version and Android API level against the CI receipt, then attach both files to the public GitHub release tagged `android-v<version>`. Mark that release as Latest after both assets upload. Keep the version code increasing and reuse the release certificate.

## Pinned toolchain and verification

AGP `8.9.2`, Gradle `8.11.1`, JDK `17`, compile/target SDK `35`, Build Tools `35.0.0`, and AndroidX WebKit `1.12.1` are explicitly configured. The wrapper scripts and JAR come from the official Gradle `v8.11.1` tag. Both the distribution and wrapper checksums were checked against [Gradle's official checksums](https://gradle.org/release-checksums/):

- Gradle binary ZIP SHA-256: `f397b287023acdba1e9f6fc5ea72d22dd63669d59ed4a289a29b1a76eee151c6`
- Wrapper JAR SHA-256: `2db75c40782f5e8ba1fc278a5574bab070adccb2d21ca5a6e5ed840888448046`

References: [AGP 8.9 compatibility](https://developer.android.com/build/releases/agp-8-9-0-release-notes), [Gradle Wrapper](https://docs.gradle.org/current/userguide/gradle_wrapper.html), [APK signing](https://developer.android.com/tools/apksigner).
