# publishing a new release

While this is not automated, we need to have the steps documented here.

Step 1: Run `npm start` to compile and minify the action into `dist/` and make sure the result in `dist/` is committed.

Step 2: Determine if the new release introduce breaking changes?

Step 3: Determine next version number - follow SemVer and either use a new major or minor version.

Step 4: if the next version is a major version, determine if the breaking changes are caused by the action or by upgrading to a new core.
If the breaking change originates in the editorconfig-checker core, first publish a tombstone release that fixes the core version in `action.yaml` to the last version not containing a breaking change.

Step 5: Tag the current commit with the full version number, push it and publish a release on GitHub for it.

Step 6: Tag the current commit also with the shortened version number (e.g. `v3`), using `git tag --force v3 v3.2.5` to overwrite the tag locally, then force-push the changed tag. This means that consumers using the short tag will get the latest release as well.
