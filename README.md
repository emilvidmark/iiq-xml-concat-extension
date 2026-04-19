# IIQ XML Concat Extension

This VS Code extension adds a command that combines multiple SailPoint IdentityIQ XML files into one import-ready file wrapped in a single `<sailpoint>` root.

## How to use

1. Multi-select `.xml` files using either of these views:
  - Explorer
  - Open Editors / selected editor tabs
2. Right-click and run **IIQ: Concat Selected XML Files For Import**.
3. The merged output opens in a new untitled XML tab.
4. Save XML on computer and import to SailPoint IdentityIQ

## Installation

1. Download the VSIX file
2. Install in VS Code using Extensions -> menu -> Install from VSIX...

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
