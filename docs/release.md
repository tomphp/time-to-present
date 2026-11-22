# Releases

The Desktop App and the Client are released on their own, from their conventional commits since
their last `desktop-v*` or `client-v*` tag. The Release workflow runs after CI passes on a push to
main and plans each component's next version. When the Client bumps, it publishes
`@time-to-present/client` to npm, tags `client-vX.Y.Z` and creates a GitHub Release with the notes.
Nothing is committed: the versions live only in the tags and in what is published.

A failed publish leaves no tag, so the next run on main picks the commits up again. A version that
is already on npm counts as published, so a re-run after a failed tag push goes on to tag it. If
only creating the GitHub Release failed, a re-run plans nothing, as the tag is already there: create
it by hand with `gh release create client-vX.Y.Z --verify-tag --notes "…"`, copying the notes from
the failed run's plan job.

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

## Local signed build

A signed release `.app` for your own Mac. It is not notarised and has no auto-update.

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
