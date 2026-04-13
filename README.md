# IIQ XML Concatenator

This VS Code extension adds a command that combines multiple SailPoint IdentityIQ XML files into one import-ready file wrapped in a single `<sailpoint>` root.

Author: Emil Vidmark

## Command

- **IIQ: Combine XML Files Into SailPoint Import** (`iiqXmlConcat.combineSelectedXml`)

## How to use

1. In Explorer, multi-select `.xml` files and right-click.
2. Run **IIQ: Combine XML Files Into SailPoint Import**.
3. The merged output opens in a new untitled XML tab.

## Install for friends

1. Build the VSIX package:
  npm install
  npm run package
2. Share the generated `.vsix` file.
3. Install in VS Code using Extensions -> menu -> Install from VSIX...

## Output format

The extension writes:

```xml
<?xml version='1.0' encoding='UTF-8'?>
<!DOCTYPE sailpoint PUBLIC "sailpoint.dtd" "sailpoint.dtd">
<sailpoint>
  <!-- concatenated objects/rules -->
</sailpoint>
```

If an input file already contains `<sailpoint>...</sailpoint>`, only the inner content is extracted to avoid nested root tags.

## Versioning and releases

- Semantic Versioning is used for version updates.
- Release notes are tracked in CHANGELOG.md.
- Step-by-step release instructions are in RELEASING.md.

Useful commands:

- npm run version:patch
- npm run version:minor
- npm run version:major
