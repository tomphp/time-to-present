# Independent tag-only versioning per component

The Desktop App and the Client are versioned independently by cocogitto in monorepo mode, from conventional commits and the paths they touch, and a version lives only in a `desktop-vX.Y.Z` or `client-vX.Y.Z` tag and in the artifacts built from it. The Client is published to npm on its own schedule, and a release with no changes for one component's users should not move that component's version, so each component gets its own tag series and there is no global tag.

- **Paths.** `client` is `packages/client/`. `desktop` is `apps/desktop/` plus `crates/`, `templates/presentation/`, `scripts/`, `Cargo.toml` and `Cargo.lock`, because the core and the template ship inside the Desktop App. Anything else (`docs/`, `protocol-fixtures/`, `.github/`, the glossary, the README, the root manifest and lockfile) belongs to neither and bumps nothing.
- **Bumps.** `feat` is minor, `fix` and `perf` are patch, and a breaking change is major, even in 0.x. cocogitto never auto-bumps 0.x to 1.0.0, so the release plan (`.github/release/plan.mjs`) moves a 0.x component with a breaking change to 1.0.0 itself. Merge commits are ignored.
- **No bump commits.** The release workflow asks cocogitto for each component's next version and notes in a throwaway clone, then tags the tested commit itself. Nothing is committed back to main, there are no CHANGELOG files, and the release notes come from each component's commits since its previous tag.
- **Stamped at build time.** The committed versions stay at the 0.1.0 placeholder in the Tauri config, the Cargo workspace, the Client's `package.json` and the template's `^0.1.0` Client range, which keeps the npm workspace link working. The release workflow stamps the real version into those files, and the template's Client range to the latest released Client, just before it builds.

It is hard to reverse because the tag names are the release history: changing scheme means a migration of tags, the release workflow and the seed tags.

## Considered Options

- **release-please**: per-package release PRs that commit the bump and a CHANGELOG. A release waits on merging a bot PR, and main fills with bump commits.
- **changesets**: hand-written change files per PR. It ignores the conventional commits the repo already checks, so the bump would be chosen twice.
- **One version for the whole repo**: simplest, but every Desktop App change would release a Client nobody needs to update, and the reverse.
