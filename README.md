# Setup EditorConfig Action

This action uses [editorconfig-checker][usage] to validate files.

[usage]: https://github.com/editorconfig-checker/editorconfig-checker#usage

## Usage

### Pre-requisites

Create a workflow `.yml` file in your repositories `.github/workflows` directory.
An [example workflow](#example-workflow) is available below.
For more information, reference the GitHub Help Documentation for [Creating a workflow file][creating-a-workflow-file].

[creating-a-workflow-file]: https://help.github.com/en/articles/configuring-a-workflow#creating-a-workflow-file

### Inputs

| Field              | Description                                                                    |
| ------------------ | ------------------------------------------------------------------------------ |
| `version`          | editorconfig-checker version to install (default: `v4.0.1`)                    |
| `github-token`     | Token used to look up the release to download (default: `${{ github.token }}`) |
| `allow-unverified` | Install a release that cannot be verified (default: `false`)                   |


The `version` default is a pinned tag rather than `latest`, so that pinning this
action to a commit SHA also pins the editorconfig-checker binary it installs.
Set `version: latest` to opt back into always installing the newest release,
at the cost of the installed binary no longer being determined by your pin.

### Verification

The downloaded archive is verified against the [GitHub release
attestation][attestations] for the release it came from, before it is extracted
or made executable. The action runs `gh release verify-asset` to
cryptographically verify that the archive was published in the release resolved
from the `version` input and wasn't tampered with during transport.

editorconfig-checker publishes release attestations from `v3.9.0` onwards.
Installing `v3.8.0` or older, or running on a runner without the GitHub CLI,
therefore fails unless you opt in:

```yaml
- uses: editorconfig-checker/action-editorconfig-checker@main
  with:
    version: v3.7.0
    allow-unverified: true
```

`allow-unverified` only permits installing a release that *cannot* be verified.
It never suppresses a verification that ran and failed, so an archive that does
not match its attestation is refused whatever this input is set to.

The GitHub CLI is preinstalled on GitHub-hosted runners. Container jobs and
some self-hosted runners have to install it, or set `allow-unverified: true`.

[attestations]: https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds

### Example workflow

```yaml
name: EditorConfig Checker

on:
  pull_request:
    branches:
      - main

jobs:
  editorconfig:
    runs-on: ubuntu-latest
    steps:
      - name: Check out code
        uses: actions/checkout@v6

      - name: Set up editorconfig-checker
        uses: editorconfig-checker/action-editorconfig-checker@main

      - name: Run editorconfig-checker
        run: editorconfig-checker
```

## License

[MIT LICENSE](LICENSE)
