const vscode = require('vscode');
const fs = require('fs/promises');
const path = require('path');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const disposable = vscode.commands.registerCommand(
    'iiqXmlConcat.combineSelectedXml',
    async (resourceUri, allSelectedResources) => {
      try {
        const selectedUris = await resolveXmlFileSelection(resourceUri, allSelectedResources);
        await combineUris(selectedUris);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`IIQ XML combine failed: ${message}`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

function deactivate() {}

/**
 * Resolve XML file selection from Explorer multi-select or file picker.
 * @param {vscode.Uri | undefined} resourceUri
 * @param {vscode.Uri[] | undefined} allSelectedResources
 */
async function resolveXmlFileSelection(resourceUri, allSelectedResources) {
  const selected = Array.isArray(allSelectedResources) ? allSelectedResources : [];
  const normalized = selected.filter((uri) => uri && uri.scheme === 'file');

  if (normalized.length > 0) {
    return normalized;
  }

  if (resourceUri && resourceUri.scheme === 'file') {
    return [resourceUri];
  }

  const pickerUris = await vscode.window.showOpenDialog({
    title: 'Select IdentityIQ XML Files to Combine',
    canSelectMany: true,
    canSelectFiles: true,
    canSelectFolders: false,
    filters: { XML: ['xml'] },
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri
  });

  return pickerUris ?? [];
}

/**
 * Shared merge flow for both command entry points.
 * @param {vscode.Uri[]} selectedUris
 */
async function combineUris(selectedUris) {
  if (!selectedUris || selectedUris.length === 0) {
    vscode.window.showWarningMessage('No XML files selected.');
    return;
  }

  const skipped = [];
  const fragments = [];
  for (const uri of selectedUris) {
    try {
      if (!uri || uri.scheme !== 'file') {
        skipped.push('non-file resource');
        continue;
      }

      if (!uri.fsPath.toLowerCase().endsWith('.xml')) {
        skipped.push(path.basename(uri.fsPath));
        continue;
      }

      const stats = await fs.stat(uri.fsPath);
      if (!stats.isFile()) {
        skipped.push(path.basename(uri.fsPath));
        continue;
      }

      const fileContent = await fs.readFile(uri.fsPath, 'utf8');
      const fragment = extractSailPointPayload(fileContent);
      if (!fragment) {
        skipped.push(path.basename(uri.fsPath));
        continue;
      }

      fragments.push(fragment);
    } catch (_fileError) {
      skipped.push(uri && uri.fsPath ? path.basename(uri.fsPath) : 'unknown resource');
    }
  }

  if (fragments.length === 0) {
    vscode.window.showErrorMessage('None of the selected items contained importable XML file content.');
    return;
  }

  const mergedXml = buildMergedDocument(fragments);
  const untitledUri = vscode.Uri.parse('untitled:merged-sailpoint-import.xml');
  const doc = await vscode.workspace.openTextDocument(untitledUri);
  const editor = await vscode.window.showTextDocument(doc, { preview: false });

  await editor.edit((editBuilder) => {
    const fullRange = new vscode.Range(
      doc.positionAt(0),
      doc.positionAt(doc.getText().length)
    );
    editBuilder.replace(fullRange, mergedXml);
  });

  const summary = skipped.length > 0
    ? `Combined ${fragments.length} XML file(s) in a new tab. Skipped ${skipped.length} item(s).`
    : `Combined ${fragments.length} XML file(s) in a new tab.`;
  vscode.window.showInformationMessage(summary);
}

/**
 * @param {string} folderPath
 * @param {boolean} recursive
 * @returns {Promise<string[]>}
 */
async function collectXmlFiles(folderPath, recursive) {
  const result = [];
  const entries = await fs.readdir(folderPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.xml')) {
      result.push(fullPath);
      continue;
    }

    if (recursive && entry.isDirectory()) {
      const nested = await collectXmlFiles(fullPath, true);
      result.push(...nested);
    }
  }

  return result;
}

/**
 * Extract importable XML content from a file.
 * - If file is wrapped in <sailpoint>, returns only inner content.
 * - Otherwise returns content after stripping XML declaration and DOCTYPE.
 * @param {string} xml
 */
function extractSailPointPayload(xml) {
  if (!xml) {
    return '';
  }

  let content = xml.replace(/^\uFEFF/, '').trim();
  content = content.replace(/^\s*<\?xml[^>]*\?>\s*/i, '');
  content = content.replace(/^\s*<!DOCTYPE[^>]*>\s*/i, '');

  const sailPointMatch = content.match(/<sailpoint\b[^>]*>([\s\S]*?)<\/sailpoint>/i);
  if (sailPointMatch && sailPointMatch[1]) {
    return sailPointMatch[1].trim();
  }

  return content.trim();
}

/**
 * @param {string[]} fragments
 */
function buildMergedDocument(fragments) {
  const body = fragments.join('\n');
  return [
    "<?xml version='1.0' encoding='UTF-8'?>",
    '<!DOCTYPE sailpoint PUBLIC "sailpoint.dtd" "sailpoint.dtd">',
    '<sailpoint>',
    body,
    '</sailpoint>',
    ''
  ].join('\n');
}

/**
 * @param {vscode.Uri[]} selectedUris
 */
function defaultOutputPath(selectedUris) {
  if (selectedUris.length > 0) {
    const firstDir = path.dirname(selectedUris[0].fsPath);
    return path.join(firstDir, 'merged-sailpoint-import.xml');
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    return path.join(workspaceRoot, 'merged-sailpoint-import.xml');
  }

  return 'merged-sailpoint-import.xml';
}

module.exports = {
  activate,
  deactivate
};
