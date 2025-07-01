import { App, TFile, Notice } from 'obsidian';
import { SupernoteFile, BatchFileManager } from './batch-file-manager';

export interface VirtualSupernoteFile extends TFile {
    supernoteFile: SupernoteFile;
    isVirtual: true;
}

export class VirtualFolderProvider {
    private app: App;
    private batchFileManager: BatchFileManager;
    private virtualFolderName = 'Supernote Device';
    private isConnected = false;
    private virtualFiles: Map<string, VirtualSupernoteFile> = new Map();
    private connectionState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
    private lastError: string | null = null;
    private connectionCheckInterval: NodeJS.Timeout | null = null;
    private isManualRefresh = false;
    private fileTreeCache: Map<string, SupernoteFile[]> = new Map();

    // Selection state
    private selectedFiles: Set<string> = new Set(); // Track selected file paths
    private selectionMode = false; // Whether we're in selection mode
    private lastClickedFile: string | null = null; // For shift-click range selection

    constructor(app: App, batchFileManager: BatchFileManager) {
        this.app = app;
        this.batchFileManager = batchFileManager;
    }

    /**
     * Initialize the virtual folder provider
     */
    async initialize(): Promise<void> {
        // Register the virtual folder in the file explorer
        this.registerVirtualFolder();

        // Set up connection status monitoring
        this.monitorConnectionStatus();
    }

    /**
     * Register the virtual folder in Obsidian's file explorer
     */
    private registerVirtualFolder(): void {
        // Hook into the file explorer to inject our virtual folder
        this.app.workspace.onLayoutReady(() => {
            this.setupFileExplorerIntegration();
        });

        // Listen for file explorer refreshes
        this.app.workspace.on('layout-change', () => {
            // Re-inject if needed after layout changes
            setTimeout(() => this.injectVirtualFolder(), 100);
        });
    }

    /**
     * Set up robust file explorer integration with mutation observer
     */
    private setupFileExplorerIntegration(): void {
        // Initial injection
        this.injectVirtualFolder();

        // Monitor for file explorer refreshes and re-inject
        const observer = new MutationObserver((mutations) => {
            let shouldReinject = false;

            mutations.forEach((mutation) => {
                // Check if our virtual folder was removed
                if (mutation.type === 'childList') {
                    const removedNodes = Array.from(mutation.removedNodes);
                    if (removedNodes.some(node =>
                        node instanceof Element &&
                        node.getAttribute('data-supernote-virtual') === 'true'
                    )) {
                        shouldReinject = true;
                    }
                }
            });

            if (shouldReinject) {
                setTimeout(() => this.injectVirtualFolder(), 50);
            }
        });

        const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
        if (fileExplorer) {
            observer.observe(fileExplorer.view.containerEl, {
                childList: true,
                subtree: true
            });
        }

        // Fallback: periodic check every 10 seconds
        setInterval(() => {
            const existingVirtualFolder = document.querySelector('[data-supernote-virtual="true"]');
            if (!existingVirtualFolder) {
                this.injectVirtualFolder();
            }
        }, 10000);
    }

    /**
     * Inject the virtual folder into the file explorer
     */
    private injectVirtualFolder(): void {
        const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
        if (!fileExplorer) return;

        // Check if virtual folder already exists
        const existingVirtualFolder = document.querySelector('[data-supernote-virtual="true"]');
        if (existingVirtualFolder) return;

        // Find the actual ROOT container that holds root-level folders
        // Based on the HTML structure, we need to find the nav-files-container
        let rootContainer: HTMLElement | null = null;

        // Primary target: nav-files-container (the main container that holds all root folders)
        rootContainer = fileExplorer.view.containerEl.querySelector('.nav-files-container') as HTMLElement;

        // If not found, try alternative selectors
        if (!rootContainer) {
            const possibleSelectors = [
                '.workspace-leaf-content[data-type="file-explorer"] > .nav-files-container',
                '.nav-files-container',
                '.workspace-leaf-content[data-type="file-explorer"] > div:first-child'
            ];

            for (const selector of possibleSelectors) {
                const candidate = fileExplorer.view.containerEl.querySelector(selector) as HTMLElement;
                if (candidate) {
                    rootContainer = candidate;
                    break;
                }
            }
        }

        // Fallback: find the container that contains folders with mod-root class
        if (!rootContainer) {
            const rootFolders = fileExplorer.view.containerEl.querySelectorAll('.nav-folder.mod-root');
            if (rootFolders.length > 0) {
                // Find the container that contains these root folders
                const firstRootFolder = rootFolders[0] as HTMLElement;
                // Look for the parent container that holds root-level folders
                let parent = firstRootFolder.parentElement;
                while (parent && !parent.classList.contains('nav-files-container')) {
                    parent = parent.parentElement;
                }
                rootContainer = parent;
            }
        }

        // Final fallback: look for the main file explorer container
        if (!rootContainer) {
            const fileExplorerView = fileExplorer.view as any;
            rootContainer = fileExplorerView.fileItems?.containerEl ||
                fileExplorer.view.containerEl.querySelector('.nav-folder-children');
        }

        if (rootContainer) {
            console.log('Found root container:', rootContainer.className, rootContainer);

            // Validate that this is actually a root-level container
            // It should contain root-level folders directly, not be inside another folder
            const hasRootFolders = rootContainer.querySelectorAll('.nav-folder').length > 0;
            const isInsideFolder = rootContainer.closest('.tree-item-children');

            if (hasRootFolders && !isInsideFolder) {
                const virtualFolder = this.createVirtualFolderElement();
                // Insert at the very beginning of the root container
                rootContainer.insertBefore(virtualFolder, rootContainer.firstChild);
                console.log('Successfully injected virtual folder at root level');
            } else {
                console.error('Container validation failed - not a root-level container');
            }
        } else {
            console.error('Could not find root container for virtual folder injection');
        }
    }

    /**
     * Create the virtual folder element
     */
    private createVirtualFolderElement(): HTMLElement {
        // Create the main tree-item wrapper
        const treeItemEl = document.createElement('div');
        treeItemEl.className = 'tree-item nav-folder'; // Don't add mod-root for virtual folders
        treeItemEl.setAttribute('data-path', this.virtualFolderName);
        treeItemEl.setAttribute('data-supernote-virtual', 'true');

        // Create the folder title section (tree-item-self)
        const folderTitleSelfEl = document.createElement('div');
        folderTitleSelfEl.className = 'tree-item-self nav-folder-title is-clickable mod-collapsible';
        folderTitleSelfEl.setAttribute('data-path', this.virtualFolderName);
        folderTitleSelfEl.setAttribute('draggable', 'true');

        // Root level: exactly like native folders (margin: 0px, padding: 24px)
        folderTitleSelfEl.style.marginInlineStart = '0px';
        folderTitleSelfEl.style.paddingInlineStart = '24px';

        // Create the collapse icon
        const collapseIconEl = document.createElement('div');
        collapseIconEl.className = 'tree-item-icon collapse-icon is-collapsed';
        collapseIconEl.innerHTML = `
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon right-triangle" style="transition: transform 0.2s ease; transform: rotate(-90deg);">
				<path d="M3 8L12 17L21 8"></path>
			</svg>
		`;

        // Create the folder title content
        const folderTitleContentEl = document.createElement('div');
        folderTitleContentEl.className = 'tree-item-inner nav-folder-title-content';
        folderTitleContentEl.textContent = `${this.virtualFolderName} ${this.connectionState === 'connected' ? '(Connected)' : this.connectionState === 'connecting' ? '(Connecting...)' : this.connectionState === 'error' ? '(Error)' : '(Disconnected)'}`;

        // Create the children container
        const folderChildrenEl = document.createElement('div');
        folderChildrenEl.className = 'tree-item-children nav-folder-children';
        folderChildrenEl.style.display = 'none'; // Start collapsed

        // Assemble the structure
        folderTitleSelfEl.appendChild(collapseIconEl);
        folderTitleSelfEl.appendChild(folderTitleContentEl);
        treeItemEl.appendChild(folderTitleSelfEl);
        treeItemEl.appendChild(folderChildrenEl);

        // Add click handler to expand/collapse
        folderTitleSelfEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleVirtualFolder(treeItemEl);
        });

        // Add right-click context menu
        folderTitleSelfEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showVirtualFolderContextMenu(e, treeItemEl);
        });

        return treeItemEl;
    }

    /**
     * Toggle virtual folder expansion
     */
    private async toggleVirtualFolder(folderEl: HTMLElement): Promise<void> {
        const isExpanded = folderEl.hasAttribute('data-expanded');
        const childrenEl = folderEl.querySelector('.tree-item-children') as HTMLElement;
        const collapseIcon = folderEl.querySelector('.collapse-icon') as HTMLElement;
        const svgIcon = folderEl.querySelector('.collapse-icon svg') as HTMLElement;

        if (isExpanded) {
            // Collapse: rotate to -90deg (pointing right)
            folderEl.removeAttribute('data-expanded');
            childrenEl.style.display = 'none';
            if (collapseIcon) {
                collapseIcon.classList.add('is-collapsed');
            }
            if (svgIcon) {
                svgIcon.style.transform = 'rotate(-90deg)';
            }
        } else {
            // Expand: rotate to 0deg (pointing down)
            folderEl.setAttribute('data-expanded', 'true');
            childrenEl.style.display = 'block';
            if (collapseIcon) {
                collapseIcon.classList.remove('is-collapsed');
            }
            if (svgIcon) {
                svgIcon.style.transform = 'rotate(0deg)';
            }
            await this.loadVirtualFiles(childrenEl);
        }
    }

    /**
     * Enhanced load virtual files with better state management
     */
    private async loadVirtualFiles(childrenEl: HTMLElement): Promise<void> {
        childrenEl.innerHTML = '';
        this.addSeparator(childrenEl);
        const path = this.batchFileManager.getCurrentPath();
        const cachedFiles = this.fileTreeCache.get(path);
        if (cachedFiles) {
            this.renderVirtualFiles(childrenEl, cachedFiles);
            this.refreshDirectoryInBackground(path, childrenEl);
            return;
        }
        if (this.connectionState === 'disconnected' || this.connectionState === 'error') {
            this.renderDisconnectedState(childrenEl);
        } else if (this.connectionState === 'connecting') {
            this.renderConnectingState(childrenEl);
        } else if (this.connectionState === 'connected') {
            await this.renderConnectedState(childrenEl);
        } else {
            this.connectionState = 'disconnected';
            this.renderDisconnectedState(childrenEl);
        }
    }

    /**
     * Render virtual files in the folder
     */
    private renderVirtualFiles(childrenEl: HTMLElement, files: SupernoteFile[]): void {
        childrenEl.innerHTML = '';

        // Add separator element like native Obsidian (for proper spacing)
        const separator = document.createElement('div');
        // Calculate width dynamically based on parent container
        const parentContainer = childrenEl.closest('.nav-folder-children') || childrenEl.parentElement;
        const containerWidth = (parentContainer as HTMLElement)?.offsetWidth || childrenEl.offsetWidth || 290;
        separator.style.width = `${containerWidth}px`;
        separator.style.height = '0.1px';
        separator.style.marginBottom = '0px';
        childrenEl.appendChild(separator);

        files.forEach(file => {
            const fileEl = this.createVirtualFileElement(file, 1); // Depth 1 for root virtual folder contents
            childrenEl.appendChild(fileEl);
        });
    }

    /**
     * Create virtual file or folder element
     */
    private createVirtualFileElement(file: SupernoteFile, depth = 1): HTMLElement {
        if (file.isDirectory) {
            return this.createVirtualDirectoryElement(file, depth);
        } else {
            return this.createVirtualFileElementInternal(file, depth);
        }
    }

    /**
     * Create virtual directory element with expand/collapse functionality
     */
    private createVirtualDirectoryElement(directory: SupernoteFile, depth: number): HTMLElement {
        // Create the main tree-item wrapper for directory
        const treeItemEl = document.createElement('div');
        treeItemEl.className = 'tree-item nav-folder is-collapsed';
        treeItemEl.setAttribute('data-path', `${this.virtualFolderName}/${directory.name}`);
        treeItemEl.setAttribute('data-supernote-folder', 'true');

        // Create the folder title section (tree-item-self)
        const folderTitleSelfEl = document.createElement('div');
        folderTitleSelfEl.className = 'tree-item-self nav-folder-title is-clickable mod-collapsible';
        folderTitleSelfEl.setAttribute('data-path', `${this.virtualFolderName}/${directory.name}`);
        folderTitleSelfEl.setAttribute('draggable', 'true');

        // Calculate indentation: margin = -17 * depth, padding = 24 + (17 * depth)
        const margin = -17 * depth;
        const padding = 24 + (17 * depth);
        folderTitleSelfEl.style.marginInlineStart = `${margin}px`;
        folderTitleSelfEl.style.paddingInlineStart = `${padding}px`;

        // Create the collapse icon
        const collapseIconEl = document.createElement('div');
        collapseIconEl.className = 'tree-item-icon collapse-icon is-collapsed';
        collapseIconEl.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon right-triangle" style="transition: transform 0.2s ease; transform: rotate(-90deg);">
                <path d="M3 8L12 17L21 8"></path>
            </svg>
        `;

        // Create the folder title content
        const folderTitleContentEl = document.createElement('div');
        folderTitleContentEl.className = 'tree-item-inner nav-folder-title-content';
        folderTitleContentEl.textContent = directory.name;

        // Create the children container
        const folderChildrenEl = document.createElement('div');
        folderChildrenEl.className = 'tree-item-children nav-folder-children';
        folderChildrenEl.style.display = 'none'; // Start collapsed

        // Assemble the structure
        folderTitleSelfEl.appendChild(collapseIconEl);
        folderTitleSelfEl.appendChild(folderTitleContentEl);
        treeItemEl.appendChild(folderTitleSelfEl);
        treeItemEl.appendChild(folderChildrenEl);

        // Add click handler to expand/collapse directory
        folderTitleSelfEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleVirtualDirectory(treeItemEl, directory, depth + 1);
        });

        // Add right-click context menu
        folderTitleSelfEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showVirtualDirectoryContextMenu(e, directory);
        });

        return treeItemEl;
    }

    /**
     * Create virtual file element (non-directory) with selection support
     */
    private createVirtualFileElementInternal(file: SupernoteFile, depth: number): HTMLElement {
        const filePath = `${this.virtualFolderName}/${file.name}`;
        const isSelected = this.selectedFiles.has(filePath);

        const treeItemEl = document.createElement('div');
        treeItemEl.className = `tree-item nav-file ${isSelected ? 'supernote-selected' : ''}`;
        treeItemEl.setAttribute('data-path', filePath);
        treeItemEl.setAttribute('data-supernote-file', 'true');
        treeItemEl.setAttribute('data-file-path', filePath);

        const fileTitleSelfEl = document.createElement('div');
        fileTitleSelfEl.className = `tree-item-self nav-file-title tappable is-clickable ${isSelected ? 'supernote-selected' : ''}`;
        fileTitleSelfEl.setAttribute('data-path', filePath);
        fileTitleSelfEl.setAttribute('draggable', 'true');

        const margin = -17 * depth;
        const padding = 24 + (17 * depth);
        fileTitleSelfEl.style.marginInlineStart = `${margin}px`;
        fileTitleSelfEl.style.paddingInlineStart = `${padding}px`;

        // Selection checkbox (hidden by default, shown when selection mode is active)
        const checkboxEl = document.createElement('div');
        checkboxEl.className = `supernote-selection-checkbox ${isSelected ? 'checked' : ''} ${this.selectionMode ? 'visible' : ''}`;
        checkboxEl.innerHTML = isSelected ? '☑️' : '☐';

        const fileTitleContentEl = document.createElement('div');
        fileTitleContentEl.className = 'tree-item-inner nav-file-title-content';
        fileTitleContentEl.textContent = file.name;

        const fileTagEl = document.createElement('div');
        fileTagEl.className = 'nav-file-tag';
        fileTagEl.textContent = file.extension || 'note';

        fileTitleSelfEl.appendChild(checkboxEl);
        fileTitleSelfEl.appendChild(fileTitleContentEl);
        fileTitleSelfEl.appendChild(fileTagEl);
        treeItemEl.appendChild(fileTitleSelfEl);

        // Enhanced click handler with selection support
        fileTitleSelfEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleFileClick(file, e);
        });

        // Right-click context menu
        fileTitleSelfEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showVirtualFileContextMenu(e, file);
        });

        return treeItemEl;
    }

    /**
 * Enhanced file click handler with selection support
 */
    private async handleFileClick(file: SupernoteFile, event: MouseEvent): Promise<void> {
        const filePath = `${this.virtualFolderName}/${file.name}`;

        // Check for modifier keys
        const isCtrlCmd = event.ctrlKey || event.metaKey;
        const isShift = event.shiftKey;

        // Selection logic
        if (isCtrlCmd || this.selectionMode) {
            // Toggle selection for this file
            this.toggleFileSelection(filePath);
            this.lastClickedFile = filePath;
            return;
        }

        if (isShift && this.lastClickedFile) {
            // Range selection
            this.selectFileRange(this.lastClickedFile, filePath);
            return;
        }

        // If we have selections, first click should clear them unless it's a .note file
        if (this.selectedFiles.size > 0) {
            if (file.extension === 'note') {
                // For .note files, ask user what they want to do
                const choice = await this.showSelectionChoice(file);
                if (choice === 'open') {
                    this.clearSelection();
                    await this.convertAndOpenFile(file);
                } else if (choice === 'select') {
                    this.toggleFileSelection(filePath);
                    this.lastClickedFile = filePath;
                }
                return;
            } else {
                this.clearSelection();
            }
        }

        // Normal click behavior
        if (file.extension === 'note') {
            // For .note files, convert to PDF and open
            await this.convertAndOpenFile(file);
        } else {
            // Select non-.note files
            this.toggleFileSelection(filePath);
            this.lastClickedFile = filePath;
        }
    }

    /**
     * Show choice dialog for .note files when selections exist
     */
    private async showSelectionChoice(file: SupernoteFile): Promise<'open' | 'select' | 'cancel'> {
        return new Promise((resolve) => {
            const modal = new (this.app as any).Modal(this.app);

            modal.titleEl.textContent = 'File Action';

            const content = modal.contentEl;
            content.createEl('p', {
                text: `What would you like to do with ${file.name}?`
            });

            const buttonContainer = content.createDiv('modal-button-container');

            const openBtn = buttonContainer.createEl('button', {
                text: 'Open File',
                cls: 'mod-cta'
            });
            openBtn.addEventListener('click', () => {
                modal.close();
                resolve('open');
            });

            const selectBtn = buttonContainer.createEl('button', {
                text: 'Add to Selection'
            });
            selectBtn.addEventListener('click', () => {
                modal.close();
                resolve('select');
            });

            const cancelBtn = buttonContainer.createEl('button', {
                text: 'Cancel'
            });
            cancelBtn.addEventListener('click', () => {
                modal.close();
                resolve('cancel');
            });

            modal.open();
        });
    }

    /**
 * Convert .note file to PDF and open with default viewer
 */
    private async convertAndOpenFile(file: SupernoteFile): Promise<void> {
        try {
            // Use the original filename
            const fileName = file.name;

            // Download the original file from the device
            const response = await fetch(`http://${this.batchFileManager['settings'].directConnectIP}:8089${file.uri}`);
            if (!response.ok) {
                throw new Error(`Failed to download file: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            if (arrayBuffer.byteLength < 100) {
                throw new Error('Downloaded file is too small, likely an error page or incomplete.');
            }

            // Check for HTML content (error page)
            const textCheck = new TextDecoder().decode(arrayBuffer.slice(0, 256));
            if (/<!DOCTYPE html>|<html|<body|<head/i.test(textCheck)) {
                throw new Error('Downloaded file appears to be HTML, not a valid Supernote file.');
            }

            // Save as .note file
            const tfile = await this.app.vault.createBinary(fileName, arrayBuffer);

            // Open with default viewer
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.openFile(tfile as TFile, { active: true });

            new Notice(`✅ Downloaded ${file.name}. PDF conversion coming soon!`);

        } catch (error) {
            console.error('Failed to convert and open file:', error);
            new Notice(`❌ Failed to open ${file.name}: ${error.message}`);
        }
    }

    /**
     * Download file to vault and open with default viewer
     */
    private async downloadAndOpenFile(file: SupernoteFile): Promise<void> {
        try {
            // Use the original filename
            const fileName = file.name;

            // Download the file from the device
            const response = await fetch(`http://${this.batchFileManager['settings'].directConnectIP}:8089${file.uri}`);
            if (!response.ok) {
                throw new Error(`Failed to download file: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            if (arrayBuffer.byteLength < 100) {
                throw new Error('Downloaded file is too small, likely an error page or incomplete.');
            }
            // Optionally, check for HTML content (error page)
            const textCheck = new TextDecoder().decode(arrayBuffer.slice(0, 256));
            if (/<!DOCTYPE html>|<html|<body|<head/i.test(textCheck)) {
                throw new Error('Downloaded file appears to be HTML, not a valid Supernote file.');
            }

            // Save to vault
            const tfile = await this.app.vault.createBinary(fileName, arrayBuffer);

            // Open with default viewer
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.openFile(tfile as TFile, { active: true });

            new Notice(`✅ Downloaded and opened ${file.name}`);

        } catch (error) {
            console.error('Failed to download and open file:', error);
            new Notice(`❌ Failed to open ${file.name}: ${error.message}`);
        }
    }

    /**
     * Toggle virtual directory expansion
     */
    private async toggleVirtualDirectory(directoryEl: HTMLElement, directory: SupernoteFile, childDepth: number): Promise<void> {
        const isExpanded = directoryEl.hasAttribute('data-expanded');
        const childrenEl = directoryEl.querySelector('.tree-item-children') as HTMLElement;
        const collapseIcon = directoryEl.querySelector('.collapse-icon') as HTMLElement;
        const svgIcon = directoryEl.querySelector('.collapse-icon svg') as HTMLElement;

        if (isExpanded) {
            // Collapse: rotate to -90deg (pointing right)
            directoryEl.removeAttribute('data-expanded');
            directoryEl.classList.add('is-collapsed');
            directoryEl.classList.remove('is-expanded');
            childrenEl.style.display = 'none';
            if (collapseIcon) {
                collapseIcon.classList.add('is-collapsed');
            }
            if (svgIcon) {
                svgIcon.style.transform = 'rotate(-90deg)';
            }
        } else {
            // Expand: rotate to 0deg (pointing down)
            directoryEl.setAttribute('data-expanded', 'true');
            directoryEl.classList.remove('is-collapsed');
            directoryEl.classList.add('is-expanded');
            childrenEl.style.display = 'block';
            if (collapseIcon) {
                collapseIcon.classList.remove('is-collapsed');
            }
            if (svgIcon) {
                svgIcon.style.transform = 'rotate(0deg)';
            }
            await this.loadVirtualDirectoryFiles(childrenEl, directory, childDepth);
        }
    }

    /**
     * Load files for a virtual directory
     */
    private async loadVirtualDirectoryFiles(childrenEl: HTMLElement, directory: SupernoteFile, depth: number): Promise<void> {
        try {
            // Navigate to the directory and get its contents
            const directoryFiles = await this.batchFileManager.loadDirectoryFiles(directory);
            this.renderVirtualDirectoryFiles(childrenEl, directoryFiles, depth);
        } catch (error) {
            // Add separator first
            const separator = document.createElement('div');
            const parentContainer = childrenEl.closest('.nav-folder-children') || childrenEl.parentElement;
            const containerWidth = (parentContainer as HTMLElement)?.offsetWidth || 290;
            separator.style.width = `${containerWidth}px`;
            separator.style.height = '0.1px';
            separator.style.marginBottom = '0px';
            childrenEl.appendChild(separator);

            // Create error message
            const errorItem = document.createElement('div');
            errorItem.className = 'tree-item nav-file';
            const margin = -17 * depth;
            const padding = 24 + (17 * depth);
            errorItem.innerHTML = `
                <div class="tree-item-self nav-file-title" style="margin-inline-start: ${margin}px; padding-inline-start: ${padding}px;">
                    <div class="tree-item-inner nav-file-title-content">Error loading directory: ${error.message}</div>
                </div>
            `;
            childrenEl.appendChild(errorItem);
        }
    }

    /**
     * Render files in a virtual directory
     */
    private renderVirtualDirectoryFiles(childrenEl: HTMLElement, files: SupernoteFile[], depth: number): void {
        childrenEl.innerHTML = '';

        // Add separator element like native Obsidian
        const separator = document.createElement('div');
        const parentContainer = childrenEl.closest('.nav-folder-children') || childrenEl.parentElement;
        const containerWidth = (parentContainer as HTMLElement)?.offsetWidth || 290;
        separator.style.width = `${containerWidth}px`;
        separator.style.height = '0.1px';
        separator.style.marginBottom = '0px';
        childrenEl.appendChild(separator);

        files.forEach(file => {
            const fileEl = this.createVirtualFileElement(file, depth);
            childrenEl.appendChild(fileEl);
        });
    }

    /**
     * Show virtual directory context menu
     */
    private showVirtualDirectoryContextMenu(event: MouseEvent, directory: SupernoteFile): void {
        const menu = new (this.app as any).Menu();

        menu.addItem((item: any) => {
            item.setTitle('Refresh Directory')
                .setIcon('refresh-cw')
                .onClick(async () => {
                    // Find the directory element and refresh its contents
                    const directoryEl = document.querySelector(`[data-path="${this.virtualFolderName}/${directory.name}"]`);
                    if (directoryEl && directoryEl.hasAttribute('data-expanded')) {
                        const childrenEl = directoryEl.querySelector('.nav-folder-children') as HTMLElement;
                        await this.loadVirtualDirectoryFiles(childrenEl, directory, 2); // Assuming depth 2 for subdirectories
                    }
                });
        });

        menu.addItem((item: any) => {
            item.setTitle('Download Directory')
                .setIcon('download')
                .onClick(() => {
                    this.downloadDirectory(directory);
                });
        });

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }

    /**
     * Download directory
     */
    private async downloadDirectory(directory: SupernoteFile): Promise<void> {
        // Implementation to download all files in a directory
        console.log(`Downloading directory: ${directory.name}`);
        // This would integrate with the existing batch downloader
    }

    /**
     * Navigate to directory
     */
    private async navigateToDirectory(dir: SupernoteFile): Promise<void> {
        if (!dir.isDirectory) return;

        this.batchFileManager.navigateToDirectory(dir);

        // Refresh the virtual folder contents
        const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
        if (fileExplorer) {
            const virtualFolder = fileExplorer.view.containerEl.querySelector('[data-supernote-virtual="true"]');
            if (virtualFolder && virtualFolder.hasAttribute('data-expanded')) {
                const childrenEl = virtualFolder.querySelector('.nav-folder-children') as HTMLElement;
                await this.loadVirtualFiles(childrenEl);
            }
        }
    }

    /**
     * Show virtual folder context menu
     */
    private showVirtualFolderContextMenu(event: MouseEvent, folderEl: HTMLElement): void {
        const menu = new (this.app as any).Menu();

        menu.addItem((item: any) => {
            item.setTitle('Refresh')
                .setIcon('refresh-cw')
                .onClick(async () => {
                    const childrenEl = folderEl.querySelector('.nav-folder-children') as HTMLElement;
                    await this.loadVirtualFiles(childrenEl);
                });
        });

        menu.addItem((item: any) => {
            item.setTitle('Connect to Device')
                .setIcon('wifi')
                .onClick(() => {
                    // Trigger connection attempt
                    this.attemptConnection();
                });
        });

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }

    /**
     * Show enhanced virtual file context menu with batch operations
     */
    private showVirtualFileContextMenu(event: MouseEvent, file: SupernoteFile): void {
        const menu = new (this.app as any).Menu();
        const filePath = `${this.virtualFolderName}/${file.name}`;
        const isSelected = this.selectedFiles.has(filePath);

        // If this file isn't selected but we have other selections, add it to selection
        if (!isSelected && this.selectedFiles.size > 0) {
            this.selectedFiles.add(filePath);
            this.updateFileSelectionVisual(filePath);
            this.updateSelectionMode();
        }

        // Selection operations
        if (this.selectedFiles.size > 0) {
            const selectedFiles = this.getSelectedFiles();
            const selectedCount = selectedFiles.length;

            menu.addItem((item: any) => {
                item.setTitle(`📋 ${selectedCount} file${selectedCount > 1 ? 's' : ''} selected`)
                    .setDisabled(true);
            });

            menu.addSeparator();

            // Batch operations
            menu.addItem((item: any) => {
                item.setTitle('📄 Convert Selected to PDF')
                    .setIcon('file-text')
                    .onClick(() => this.batchConvertFiles(selectedFiles, 'pdf'));
            });

            menu.addItem((item: any) => {
                item.setTitle('⬇️ Download Selected Originals')
                    .setIcon('download')
                    .onClick(() => this.batchDownloadFiles(selectedFiles));
            });

            menu.addSeparator();

            menu.addItem((item: any) => {
                item.setTitle('❌ Clear Selection')
                    .setIcon('x')
                    .onClick(() => this.clearSelection());
            });

        } else {
            // Single file operations
            if (!file.isDirectory) {
                menu.addItem((item: any) => {
                    item.setTitle('📄 Convert to PDF')
                        .setIcon('file-text')
                        .onClick(() => this.convertFile(file, 'pdf'));
                });

                menu.addSeparator();
            }

            menu.addItem((item: any) => {
                item.setTitle('⬇️ Download Original')
                    .setIcon('download')
                    .onClick(() => this.downloadFile(file));
            });

            menu.addSeparator();

            menu.addItem((item: any) => {
                item.setTitle('☑️ Select File')
                    .setIcon('check-square')
                    .onClick(() => {
                        this.toggleFileSelection(filePath);
                        this.lastClickedFile = filePath;
                    });
            });
        }

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }

    /**
     * Enhanced attempt connection with better state management
     */
    private async attemptConnection(manual = false): Promise<void> {
        if (!this.hasValidIP()) {
            this.connectionState = 'error';
            this.lastError = 'No IP address configured';
            this.updateConnectionStatus();
            return;
        }

        this.connectionState = 'connecting';
        this.lastError = null;
        this.updateConnectionStatus();
        // If manual refresh, update any expanded folders immediately
        if (manual) {
            this.refreshExpandedFolders();
        }

        try {
            await this.batchFileManager.loadFiles();
            this.connectionState = 'connected';
            this.lastError = null;
        } catch (error) {
            this.connectionState = 'error';
            this.lastError = error.message;
        }

        this.updateConnectionStatus();
        // Update expanded folders if this was a manual refresh
        if (manual) {
            this.refreshExpandedFolders();
        }
    }

    /**
     * Convert file to PDF
     */
    private async convertFile(file: SupernoteFile, format: 'pdf'): Promise<void> {
        // This would integrate with the existing batch downloader
        console.log(`Converting ${file.name} to ${format}`);
        // Implementation would call the batch downloader
    }

    /**
     * Download original file
     */
    private async downloadFile(file: SupernoteFile): Promise<void> {
        // This would integrate with the existing batch downloader
        console.log(`Downloading ${file.name}`);
        // Implementation would call the batch downloader
    }

    /**
     * Monitor connection status
     */
    private monitorConnectionStatus(): void {
        // Check connection status periodically
        setInterval(async () => {
            try {
                await this.batchFileManager.loadFiles();
                if (!this.isConnected) {
                    this.isConnected = true;
                    this.updateConnectionStatus();
                }
            } catch (error) {
                if (this.isConnected) {
                    this.isConnected = false;
                    this.updateConnectionStatus();
                }
            }
        }, 30000); // Check every 30 seconds
    }

    /**
     * Update connection status display
     */
    private updateConnectionStatus(): void {
        const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
        if (!fileExplorer) return;

        const virtualFolders = fileExplorer.view.containerEl.querySelectorAll('[data-supernote-virtual="true"]');
        virtualFolders.forEach(folder => {
            const titleEl = folder.querySelector('.tree-item-inner.nav-folder-title-content');
            if (titleEl) {
                let status = '';
                switch (this.connectionState) {
                    case 'connected':
                        status = '(Connected)';
                        break;
                    case 'connecting':
                        status = '(Connecting...)';
                        break;
                    case 'error':
                        status = '(Error)';
                        break;
                    default:
                        status = '(Disconnected)';
                }
                titleEl.textContent = `${this.virtualFolderName} ${status}`;
            }
        });
    }

    /**
     * Clean up the virtual folder provider
     */
    cleanup(): void {
        // Clear selections
        this.clearSelection();

        // Remove virtual folder from file explorer
        const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
        if (fileExplorer) {
            const virtualFolder = fileExplorer.view.containerEl.querySelector('[data-supernote-virtual="true"]');
            if (virtualFolder) {
                virtualFolder.remove();
            }
        }
    }

    /**
     * Add separator element for proper spacing
     */
    private addSeparator(childrenEl: HTMLElement): void {
        const separator = document.createElement('div');
        const parentContainer = childrenEl.closest('.nav-folder-children') || childrenEl.parentElement;
        const containerWidth = (parentContainer as HTMLElement)?.offsetWidth || 290;
        separator.style.width = `${containerWidth}px`;
        separator.style.height = '0.1px';
        separator.style.marginBottom = '0px';
        childrenEl.appendChild(separator);
    }

    /**
     * Create a file-like item (status, connect, settings) using the same structure as regular files
     */
    private createFileLikeItem(icon: string, label: string, description?: string, onClick?: () => void): HTMLElement {
        const item = document.createElement('div');
        item.className = 'tree-item nav-file supernote-action-item';

        const self = item.createDiv('tree-item-self nav-file-title' + (onClick ? ' is-clickable' : ''));
        self.setAttribute('draggable', 'false');
        self.style.marginInlineStart = '-17px';
        self.style.paddingInlineStart = '41px';

        const content = self.createDiv('tree-item-inner nav-file-title-content');
        content.textContent = label;

        // Add icon (emoji or SVG)
        const iconDiv = document.createElement('div');
        iconDiv.className = 'nav-file-tag';
        iconDiv.textContent = icon;
        self.appendChild(iconDiv);

        // Add description as a tooltip
        if (description) {
            self.setAttribute('title', description);
        }

        // Click handler
        if (onClick) {
            self.addEventListener('click', (e) => {
                e.stopPropagation();
                onClick();
            });
            self.classList.add('is-clickable');
        }

        return item;
    }

    /**
     * Render disconnected state with connection options (file-like)
     */
    private renderDisconnectedState(childrenEl: HTMLElement): void {
        // Status message
        childrenEl.appendChild(this.createFileLikeItem(
            '📵',
            'Device Disconnected',
            this.lastError || 'Connect to your Supernote device to browse files'
        ));

        // Connect button
        childrenEl.appendChild(this.createFileLikeItem(
            '🔌',
            'Connect to Device',
            'Click to attempt connection',
            () => this.handleManualConnect()
        ));

        // Settings shortcut (if IP not configured)
        if (!this.hasValidIP()) {
            childrenEl.appendChild(this.createFileLikeItem(
                '⚙️',
                'Configure IP Address',
                'Set your Supernote device IP in settings',
                () => this.openPluginSettings()
            ));
        }
    }

    /**
     * Render connecting state (file-like)
     */
    private renderConnectingState(childrenEl: HTMLElement): void {
        const connectingItem = this.createFileLikeItem(
            '🔄',
            'Connecting...',
            'Attempting to connect to Supernote device'
        );
        // Add animated spinner
        const iconDiv = connectingItem.querySelector('.nav-file-tag') as HTMLElement;
        if (iconDiv) {
            iconDiv.style.animation = 'spin 1s linear infinite';
        }
        childrenEl.appendChild(connectingItem);

        // Cancel button
        childrenEl.appendChild(this.createFileLikeItem(
            '❌',
            'Cancel',
            'Cancel connection attempt',
            () => this.cancelConnection()
        ));
    }

    /**
     * Render connected state with files
     */
    private async renderConnectedState(childrenEl: HTMLElement): Promise<void> {
        try {
            const path = this.batchFileManager.getCurrentPath();
            const files = await this.batchFileManager.loadFiles();
            this.fileTreeCache.set(path, files);
            if (files.length === 0) {
                const emptyItem = this.createFileLikeItem(
                    '📂',
                    'No Files Found',
                    'No files found in the current directory'
                );
                childrenEl.appendChild(emptyItem);
                const refreshItem = this.createFileLikeItem(
                    '🔄',
                    'Refresh',
                    'Refresh file list',
                    () => this.handleManualRefresh()
                );
                childrenEl.appendChild(refreshItem);
            } else {
                this.renderVirtualFiles(childrenEl, files);
            }
        } catch (error) {
            this.connectionState = 'error';
            this.lastError = error.message;
            this.updateConnectionStatus();
            this.renderDisconnectedState(childrenEl);
        }
    }

    /**
     * Handle manual connect button click
     */
    private async handleManualConnect(): Promise<void> {
        this.isManualRefresh = true;
        await this.attemptConnection(true);
    }

    /**
     * Check if we have a valid IP address configured
     */
    private hasValidIP(): boolean {
        const ip = this.batchFileManager['settings']?.directConnectIP;
        return ip && ip.length > 0 && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
    }

    /**
     * Open plugin settings
     */
    private openPluginSettings(): void {
        (this.app as any).setting.open();
        (this.app as any).setting.openTabById('supernote');
    }

    /**
     * Cancel connection attempt
     */
    private cancelConnection(): void {
        this.connectionState = 'disconnected';
        this.lastError = 'Connection cancelled by user';
        this.updateConnectionStatus();
        this.refreshExpandedFolders();
    }

    /**
     * Handle manual refresh
     */
    private async handleManualRefresh(): Promise<void> {
        this.isManualRefresh = true;
        await this.attemptConnection(true);
    }

    /**
     * Refresh content of expanded folders
     */
    private refreshExpandedFolders(): void {
        const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
        if (!fileExplorer) return;
        const expandedFolders = fileExplorer.view.containerEl.querySelectorAll('[data-supernote-virtual="true"][data-expanded="true"]');
        expandedFolders.forEach(folder => {
            const childrenEl = folder.querySelector('.tree-item-children') as HTMLElement;
            if (childrenEl) {
                this.loadVirtualFiles(childrenEl);
            }
        });
    }

    // Add background refresh method
    private async refreshDirectoryInBackground(path: string, childrenEl: HTMLElement) {
        try {
            const files = await this.batchFileManager.loadFiles(path);
            this.fileTreeCache.set(path, files);
            this.renderVirtualFiles(childrenEl, files);
        } catch (e) {
            // Optionally show a refresh error
        }
    }

    // Update loadDirectoryFiles to cache subdirectory contents
    async loadDirectoryFiles(directory: SupernoteFile): Promise<SupernoteFile[]> {
        if (!directory.isDirectory) {
            return [];
        }
        const originalPath = this.batchFileManager.getCurrentPath();
        this.batchFileManager['currentPath'] = directory.uri;
        try {
            const files = await this.batchFileManager.loadFiles();
            this.fileTreeCache.set(directory.uri, files);
            return files;
        } finally {
            this.batchFileManager['currentPath'] = originalPath;
        }
    }

    // Selection Management Methods

    /**
     * Toggle selection for a file
     */
    private toggleFileSelection(filePath: string): void {
        if (this.selectedFiles.has(filePath)) {
            this.selectedFiles.delete(filePath);
        } else {
            this.selectedFiles.add(filePath);
        }

        // Update visual state
        this.updateFileSelectionVisual(filePath);

        // Update selection mode
        this.updateSelectionMode();
    }

    /**
     * Select range of files between two paths
     */
    private selectFileRange(startPath: string, endPath: string): void {
        const allFiles = Array.from(document.querySelectorAll('[data-supernote-file="true"]'));
        const startIndex = allFiles.findIndex(el => el.getAttribute('data-file-path') === startPath);
        const endIndex = allFiles.findIndex(el => el.getAttribute('data-file-path') === endPath);

        if (startIndex === -1 || endIndex === -1) return;

        const minIndex = Math.min(startIndex, endIndex);
        const maxIndex = Math.max(startIndex, endIndex);

        for (let i = minIndex; i <= maxIndex; i++) {
            const filePath = allFiles[i].getAttribute('data-file-path');
            if (filePath) {
                this.selectedFiles.add(filePath);
                this.updateFileSelectionVisual(filePath);
            }
        }

        this.updateSelectionMode();
    }

    /**
     * Clear all selections
     */
    private clearSelection(): void {
        const selectedPaths = Array.from(this.selectedFiles);
        this.selectedFiles.clear();

        // Update visuals
        selectedPaths.forEach(path => this.updateFileSelectionVisual(path));
        this.updateSelectionMode();
    }

    /**
     * Update visual state of a file's selection
     */
    private updateFileSelectionVisual(filePath: string): void {
        const fileElement = document.querySelector(`[data-file-path="${filePath}"]`);
        if (!fileElement) return;

        const isSelected = this.selectedFiles.has(filePath);
        const treeItem = fileElement.closest('.tree-item');
        const checkbox = fileElement.querySelector('.supernote-selection-checkbox');

        if (treeItem) {
            treeItem.classList.toggle('supernote-selected', isSelected);
        }

        if (fileElement) {
            fileElement.classList.toggle('supernote-selected', isSelected);
        }

        if (checkbox) {
            checkbox.classList.toggle('checked', isSelected);
            checkbox.innerHTML = isSelected ? '☑️' : '☐';
        }
    }

    /**
     * Update selection mode state
     */
    private updateSelectionMode(): void {
        const wasInSelectionMode = this.selectionMode;
        this.selectionMode = this.selectedFiles.size > 0;

        if (wasInSelectionMode !== this.selectionMode) {
            // Update all checkboxes visibility
            const checkboxes = document.querySelectorAll('.supernote-selection-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.classList.toggle('visible', this.selectionMode);
            });

            // Update virtual folder title
            this.updateVirtualFolderTitle();
        }
    }

    /**
     * Update virtual folder title with selection info
     */
    private updateVirtualFolderTitle(): void {
        const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
        if (!fileExplorer) return;

        const virtualFolder = fileExplorer.view.containerEl.querySelector('[data-supernote-virtual="true"]');
        if (!virtualFolder) return;

        const titleEl = virtualFolder.querySelector('.tree-item-inner.nav-folder-title-content');
        if (titleEl) {
            let titleText = this.virtualFolderName;

            if (this.selectedFiles.size > 0) {
                titleText += ` (${this.selectedFiles.size} selected)`;
            } else {
                titleText += this.isConnected ? ' (Connected)' : ' (Disconnected)';
            }

            titleEl.textContent = titleText;
        }
    }

    /**
     * Get selected files as SupernoteFile objects
     */
    private getSelectedFiles(): SupernoteFile[] {
        const selectedFiles: SupernoteFile[] = [];

        this.selectedFiles.forEach(filePath => {
            const fileName = filePath.replace(`${this.virtualFolderName}/`, '');
            // Find the file in our cached files
            for (const [, files] of this.fileTreeCache.entries()) {
                const file = files.find(f => f.name === fileName);
                if (file) {
                    selectedFiles.push(file);
                    break;
                }
            }
        });

        return selectedFiles;
    }

    /**
     * Batch convert files to PDF
     */
    private async batchConvertFiles(files: SupernoteFile[], format: 'pdf'): Promise<void> {
        const notice = new Notice(`Converting ${files.length} files to ${format.toUpperCase()}...`, 0);

        try {
            let successCount = 0;
            let errorCount = 0;

            for (const file of files) {
                try {
                    await this.convertFile(file, format);
                    successCount++;
                } catch (error) {
                    console.error(`Failed to convert ${file.name}:`, error);
                    errorCount++;
                }
            }

            notice.hide();

            if (successCount > 0) {
                new Notice(`✅ Converted ${successCount} file${successCount > 1 ? 's' : ''} to ${format.toUpperCase()}`);
            }

            if (errorCount > 0) {
                new Notice(`❌ Failed to convert ${errorCount} file${errorCount > 1 ? 's' : ''}`);
            }

            // Clear selection after successful batch operation
            if (successCount > 0) {
                this.clearSelection();
            }

        } catch (error) {
            notice.hide();
            new Notice(`❌ Batch conversion failed: ${error.message}`);
        }
    }

    /**
     * Batch download files
     */
    private async batchDownloadFiles(files: SupernoteFile[]): Promise<void> {
        const notice = new Notice(`Downloading ${files.length} files...`, 0);

        try {
            let successCount = 0;
            let errorCount = 0;

            for (const file of files) {
                try {
                    await this.downloadFile(file);
                    successCount++;
                } catch (error) {
                    console.error(`Failed to download ${file.name}:`, error);
                    errorCount++;
                }
            }

            notice.hide();

            if (successCount > 0) {
                new Notice(`✅ Downloaded ${successCount} file${successCount > 1 ? 's' : ''}`);
            }

            if (errorCount > 0) {
                new Notice(`❌ Failed to download ${errorCount} file${errorCount > 1 ? 's' : ''}`);
            }

            // Clear selection after successful batch operation
            if (successCount > 0) {
                this.clearSelection();
            }

        } catch (error) {
            notice.hide();
            new Notice(`❌ Batch download failed: ${error.message}`);
        }
    }
} 