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

| Field     | Description                 |
| --------- | --------------------------- |
| `version` | Version (default: `latest`) |

### Example workflow

```yaml
name: EditorConfig Checker

on:
  pull_request:
    branches:
      - main

jobs:
  editorconfig:
    runs-on: ubuntu-24.04
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
