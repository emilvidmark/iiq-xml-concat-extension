const vscode = require('vscode');
const fs = require('fs/promises');
const path = require('path');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const disposable = vscode.commands.registerCommand(
    'iiqXmlConcat.combineSelectedXml',
    async (...args) => {
      try {
        const { resourceUri, allSelectedResources } = normalizeCommandArgs(args);
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
 * Normalize command arguments from Explorer/Open Editors/Tab context menus.
 * @param {unknown[]} args
 */
function normalizeCommandArgs(args) {
  const [first, second] = Array.isArray(args) ? args : [];
  const firstAsUri = asFileUri(first);
  const secondAsUriList = asFileUriList(second);

  if (firstAsUri || secondAsUriList.length > 0) {
    return {
      resourceUri: firstAsUri,
      allSelectedResources: secondAsUriList
    };
  }

  if (isObject(first)) {
    const resourceUri = asFileUri(first.resourceUri);
    const allSelectedResources = asFileUriList(first.allSelectedResources);
    return { resourceUri, allSelectedResources };
  }

  return {
    resourceUri: undefined,
    allSelectedResources: []
  };
}

/**
 * @param {unknown} value
 */
function asFileUri(value) {
  if (!value || !isObject(value)) {
    return undefined;
  }

  if (typeof value.scheme === 'string' && typeof value.fsPath === 'string') {
    return value;
  }

  return undefined;
}

/**
 * @param {unknown} value
 */
function asFileUriList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asFileUri(item))
    .filter((item) => Boolean(item));
}

/**
 * @param {unknown} value
 */
function isObject(value) {
  return typeof value === 'object' && value !== null;
}

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

  const selectedTabUris = getSelectedTabFileUris().filter((uri) => uri.fsPath.toLowerCase().endsWith('.xml'));
  if (selectedTabUris.length > 1) {
    return selectedTabUris;
  }

  if (resourceUri && resourceUri.scheme === 'file') {
    if (resourceUri.fsPath.toLowerCase().endsWith('.xml')) {
      const openXmlTabs = getOpenXmlTabUris();
      if (openXmlTabs.length > 1) {
        const picked = await pickUrisFromOpenTabs(openXmlTabs, resourceUri);
        if (picked.length > 0) {
          return picked;
        }
      }
    }

    return [resourceUri];
  }

  if (selectedTabUris.length === 1) {
    return selectedTabUris;
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
 * Get all open XML file tabs across tab groups.
 * @returns {vscode.Uri[]}
 */
function getOpenXmlTabUris() {
  const groups = vscode.window.tabGroups?.all ?? [];
  const seen = new Set();
  const uris = [];

  for (const group of groups) {
    for (const tab of group.tabs ?? []) {
      const uri = asFileUriFromTabInput(tab?.input);
      if (!uri || uri.scheme !== 'file' || !uri.fsPath.toLowerCase().endsWith('.xml')) {
        continue;
      }

      if (!seen.has(uri.fsPath)) {
        seen.add(uri.fsPath);
        uris.push(uri);
      }
    }
  }

  return uris;
}

/**
 * Offer a fallback picker for open XML tabs when multi-select context is unavailable.
 * @param {vscode.Uri[]} openXmlUris
 * @param {vscode.Uri} preferredUri
 * @returns {Promise<vscode.Uri[]>}
 */
async function pickUrisFromOpenTabs(openXmlUris, preferredUri) {
  const items = openXmlUris.map((uri) => ({
    label: path.basename(uri.fsPath),
    description: path.dirname(uri.fsPath),
    uri,
    picked: uri.fsPath === preferredUri.fsPath
  }));

  const selectedItems = await vscode.window.showQuickPick(items, {
    title: 'Select XML Tabs to Combine',
    canPickMany: true,
    matchOnDescription: true,
    placeHolder: 'VS Code only passed one tab. Pick all XML tabs you want to merge.'
  });

  if (!selectedItems || selectedItems.length === 0) {
    return [];
  }

  return selectedItems.map((item) => item.uri);
}

/**
 * Read selected tabs from the active tab group and map each tab to a file URI when possible.
 * @returns {vscode.Uri[]}
 */
function getSelectedTabFileUris() {
  const activeGroup = vscode.window.tabGroups?.activeTabGroup;
  if (!activeGroup || !Array.isArray(activeGroup.selectedTabs) || activeGroup.selectedTabs.length === 0) {
    return [];
  }

  const seen = new Set();
  const uris = [];

  for (const tab of activeGroup.selectedTabs) {
    const uri = asFileUriFromTabInput(tab?.input);
    if (!uri || uri.scheme !== 'file') {
      continue;
    }

    if (!seen.has(uri.fsPath)) {
      seen.add(uri.fsPath);
      uris.push(uri);
    }
  }

  return uris;
}

/**
 * Best-effort extraction of a URI from various tab input shapes.
 * @param {unknown} tabInput
 * @returns {vscode.Uri | undefined}
 */
function asFileUriFromTabInput(tabInput) {
  if (!isObject(tabInput)) {
    return undefined;
  }

  const candidates = [tabInput.uri, tabInput.resource, tabInput.modified, tabInput.original];
  for (const candidate of candidates) {
    const uri = asFileUri(candidate);
    if (uri) {
      return uri;
    }
  }

  return undefined;
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
  const doc = await vscode.workspace.openTextDocument({
    language: 'xml',
    content: mergedXml
  });
  await vscode.window.showTextDocument(doc, { preview: false });

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
