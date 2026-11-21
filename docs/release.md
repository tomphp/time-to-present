# Local release build

A signed release `.app` for your own Mac. It is not notarised and has no auto-update.

## Make the signing identity (once)

macOS ties a microphone grant to the app's code signature. An ad-hoc signature changes on every
build, so the grant is lost. A fixed identity keeps it.

1. Open Keychain Access, then Certificate Assistant → Create a Certificate…
2. Name: `Time to Present Local`. Identity Type: Self Signed Root. Certificate Type: Code Signing.
3. Create it, then check it appears under `security find-identity -v -p codesigning`.
   If it is listed as not trusted, open it, expand Trust, and set Code Signing to Always Trust.

Use a different name by setting `SIGNING_IDENTITY`.

## Build and install

```sh
scripts/release-build.sh
cp -R "target/release/bundle/macos/Time to Present.app" /Applications/
```

Replace the old copy each time: `rm -rf "/Applications/Time to Present.app"` first.

## Check the microphone grant survives a rebuild

1. Open the installed app and click Check microphone. Allow the prompt.
2. Rebuild, replace the app in /Applications, open it and click Check microphone again.
3. It must say "Microphone access granted" with no new prompt. If it prompts again, the identity
   changed between builds: compare `codesign -dr - "/Applications/Time to Present.app"` output.

Reset a grant with `tccutil reset Microphone dev.timetopresent.desktop`.
