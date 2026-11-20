# Anivio Android releases

Use **Anivio release** (`build-apk.yml`) from GitHub Actions. Select the source ref, patch/minor/major increment, architecture, release/debug build, beta flag, and draft/publish/artifact mode. Draft is the default. Leave **Build Windows x64 and attach it to the same release** enabled to get both the Android APKs and Windows installer under one release tag. The older mobile release workflow remains the manual version-file workflow for iOS and Android.

The workflow definition runs from the branch selected in GitHub’s **Use workflow from** menu. The **ref** input chooses the source it checks out and builds. Keep the workflow on `cmp-rewrite` and select a ref that includes the release script and Gradle version overrides.

Android builds from the selected ref. During version allocation, the workflow records the current `codex/windows-preview` commit and builds Windows from that exact commit. Both apps display the allocated version. Shared app fixes need to reach both branches before you run the release. Each platform keeps its own source and installer. Debug builds only produce Android artifacts.

The workflow fetches the selected commit and full history, reads prior releases (including drafts), and calculates a version under one concurrency lock. Patch builds continue an existing beta train or promote it to stable when **prerelease** is off. For example, with a source version of 2.1.2, the first patch beta is `2.1.3-beta.1`, the next is `2.1.3-beta.2`, and the stable promotion is `2.1.3`. Minor and major select a new version relative to the highest source or stable version. Debug builds always use a beta version. Each release calculates its Android code independently by adding one to the highest source code or prior release marker. Gradle uses the allocated version and code for the package and the app’s About and updater screens.

`iosApp/Configuration/Version.xcconfig` supplies the minimum source version/code. Published release bodies contain a machine-readable code marker, and every release includes `release.json`. Keep those markers and metadata when editing release notes; they preserve monotonic version allocation.

Release notes use first-parent commits since the most recently published release whose tag is already in the selected ref’s history. A published beta can be that starting point. Without a matching tag, the notes use the ref’s first-parent history. Squash merge titles and direct commit titles make the notes readable. Use `feat:` for New features, `fix:` for Fixes, and `ci:`, `build:`, `docs:`, `test:`, or `chore:` for Maintenance. Other subjects go under Improvements. Add `[skip release notes]` to omit a commit. Subjects starting with `chore(release):` are also omitted.

Each successful build uploads APKs, `release.json`, checksums, and the notes to the Actions run. **Artifact** ends there and is required for debug builds, which use a separate application ID. **Draft** creates a release you can review and publish under Releases. **Publish** creates it immediately. Drafts reserve versions and the changelog uses published tags. Published stable builds are marked latest. The stable in-app update channel skips prereleases, and the beta channel includes them.

When Windows is enabled, the publishing job waits for both builds. It adds `Anivio-Windows-x64.exe` to the release, records the Windows source in `release.json`, and verifies all package checksums before creating the release. The Windows installer keeps its MSI upgrade identity and uses the allocated release code for Windows Installer ordering across betas and stable versions.

Required for signed draft/public release builds:

- `NUVIO_RELEASE_KEYSTORE_BASE64`
- `NUVIO_RELEASE_STORE_PASSWORD`
- `NUVIO_RELEASE_KEY_ALIAS`
- `NUVIO_RELEASE_KEY_PASSWORD`

Reuse the existing release key so users can upgrade in place. Release publication refuses a missing/partial key instead of silently switching signing identities. Artifact mode retains the existing CI fallback for local testing. Runtime API configuration uses the existing named Actions secrets; no privileged Supabase key belongs in an APK.

Verification: `python scripts/test_prepare_android_release.py`. The website/release check workflow also runs these tests on affected pushes and pull requests. No release is automatically dispatched by those checks.

For browser-assisted device sign-in, configure the repository variable `ANIVIO_DEVICE_LINK_URL` with the public website approval page (`https://your-domain/link`). An owner-private preview cannot serve as the public app's device approval page.
