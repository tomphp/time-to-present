# Releases

The Desktop App and the Client are released on their own, from their conventional commits since
their last `desktop-v*` or `client-v*` tag. The Release workflow runs after CI passes on a push to
main and plans each component's next version. When the Client bumps, it publishes
`@time-to-present/client` to npm, tags `client-vX.Y.Z` and creates a GitHub Release with the notes.
When the Desktop App bumps, it builds the installers on macOS, Windows and Linux (after the Client,
when that releases too, so the template asks for the latest Client), then tags `desktop-vX.Y.Z` and
creates a GitHub Release with the notes, install notes, every installer and `checksums.txt`.
Nothing is committed: the versions live only in the tags and in what is published.

A failed publish leaves no tag, so the next run on main picks the commits up again. A version that
is already on npm counts as published, so a re-run after a failed tag push goes on to tag it. If
only creating the GitHub Release failed, a re-run plans nothing, as the tag is already there: create
it by hand with `gh release create client-vX.Y.Z --verify-tag --notes "…"`, copying the notes from
the failed run's plan job.

A Desktop App build that fails on any OS leaves no `desktop-v*` tag, so the next run on main picks
its commits up again; a Client released earlier in the same run stands. If the Desktop App's tag or
GitHub Release failed after the builds passed, re-run the failed `desktop-release` job: it reuses
the built installers and goes on from a tag that is already on the commit.

## Install a release

Each Desktop App release on the repository's Releases page has these installers, and
`checksums.txt` with the SHA-256 of each. Check a download with
`shasum -a 256 <file>` (macOS, Linux) or `Get-FileHash <file>` (Windows) against its line there.

| OS | Installer |
| --- | --- |
| macOS (Apple silicon) | `Time-to-Present_X.Y.Z_aarch64.dmg` |
| Windows (x64) | `Time-to-Present_X.Y.Z_x64-setup.exe` |
| Linux (x86-64) | the `.AppImage`, or the `.deb` for Debian and Ubuntu |

### macOS

The app is signed ad hoc, with the hardened runtime and microphone entitlement, but not notarised,
so Gatekeeper says it is damaged or from an unidentified developer. Clear the download's
quarantine before opening the `.dmg`, then drag the app into Applications:

```sh
xattr -d com.apple.quarantine ~/Downloads/Time-to-Present_X.Y.Z_aarch64.dmg
```

If you already copied the app out of a quarantined `.dmg`, clear the app instead:
`xattr -dr com.apple.quarantine "/Applications/Time to Present.app"`.

macOS asks for microphone access again after every update. It ties the grant to the app's code
signature, and each ad hoc signature is new. Allow the prompt again; if the app says access is
denied with no prompt, reset it with `tccutil reset Microphone dev.timetopresent.desktop`.

### Windows

The installer is unsigned, so SmartScreen warns that it protected your PC. Choose More info, then
Run anyway.

### Linux

Make the AppImage executable and run it (it needs `libfuse2`), or install the `.deb`:

```sh
chmod +x Time-to-Present_X.Y.Z_amd64.AppImage && ./Time-to-Present_X.Y.Z_amd64.AppImage
sudo apt install ./<file>.deb
```

## One-off setup

Do these once, in order.

1. On npmjs.com, create the `time-to-present` organisation (the free plan is enough for public
   packages).
2. Publish `@time-to-present/client@0.1.0` by hand from main, as the compiled build. npm only lets
   you add a trusted publisher to a package that exists.

   ```sh
   npm login
   node scripts/stamp.mjs client 0.1.0
   npm run build -w @time-to-present/client
   npm publish -w @time-to-present/client --access public
   git checkout packages/client/package.json
   ```

3. In the package's Settings on npmjs.com, add a Trusted Publisher: GitHub Actions, user `tomphp`,
   repository `time-to-present`, workflow `release.yml`, no environment.
4. Push the seed tags on main's tip as soon as the release workflow lands, before CI on that commit
   finishes and starts the first release run. Without them the plan counts the whole history.

   ```sh
   git switch main && git pull
   git tag -a desktop-v0.1.0 -m desktop-v0.1.0
   git tag -a client-v0.1.0 -m client-v0.1.0
   git push origin desktop-v0.1.0 client-v0.1.0
   ```

   A release run that starts before the tags are pushed fails its plan job without releasing
   anything.

## First Desktop App release checks

When the first Desktop App release is out, check by hand:

1. On Windows, the installer installs the app and it starts.
2. On Linux, the AppImage and the `.deb` start the app.
3. On macOS, the `.dmg` opens after clearing its quarantine, and the app starts and asks for the
   microphone.

Full QA on Windows and Linux is not needed.

## Local signed build

A signed release `.app` for your own Mac that keeps its microphone grant across rebuilds. It is not
notarised and has no auto-update. The Release workflow does not use it: it signs ad hoc.

### Make the signing identity (once)

macOS ties a microphone grant to the app's code signature. An ad-hoc signature changes on every
build, so the grant is lost. A fixed identity keeps it.

1. Open Keychain Access, then Certificate Assistant → Create a Certificate…
2. Name: `Time to Present Local`. Identity Type: Self Signed Root. Certificate Type: Code Signing.
3. Create it, then check it appears under `security find-identity -v -p codesigning`.
   If it is listed as not trusted, open it, expand Trust, and set Code Signing to Always Trust.

Use a different name by setting `SIGNING_IDENTITY`.

### Build and install

```sh
scripts/release-build.sh
cp -R "target/release/bundle/macos/Time to Present.app" /Applications/
```

Replace the old copy each time: `rm -rf "/Applications/Time to Present.app"` first.

### Check the microphone grant survives a rebuild

1. Open the installed app and click Check microphone. Allow the prompt.
2. Rebuild, replace the app in /Applications, open it and click Check microphone again.
3. It must say "Microphone access granted" with no new prompt. If it prompts again, the identity
   changed between builds: compare `codesign -dr - "/Applications/Time to Present.app"` output.

Reset a grant with `tccutil reset Microphone dev.timetopresent.desktop`.
