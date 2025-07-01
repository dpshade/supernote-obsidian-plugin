import { App, TFile } from 'obsidian';
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
        folderTitleContentEl.textContent = `${this.virtualFolderName} ${this.isConnected ? '(Connected)' : '(Disconnected)'}`;

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
 * Load virtual files into the folder
 */
    private async loadVirtualFiles(childrenEl: HTMLElement): Promise<void> {
        if (!this.isConnected) {
            // Add separator first
            const separator = document.createElement('div');
            // Calculate width dynamically based on parent container
            const parentContainer = childrenEl.closest('.nav-folder-children') || childrenEl.parentElement;
            const containerWidth = (parentContainer as HTMLElement)?.offsetWidth || childrenEl.offsetWidth || 290;
            separator.style.width = `${containerWidth}px`;
            separator.style.height = '0.1px';
            separator.style.marginBottom = '0px';
            childrenEl.appendChild(separator);

            // Create a proper tree-item structure for the error message
            const errorItem = document.createElement('div');
            errorItem.className = 'tree-item nav-file';
            errorItem.innerHTML = `
				<div class="tree-item-self nav-file-title" style="margin-inline-start: -17px; padding-inline-start: 41px;">
					<div class="tree-item-inner nav-file-title-content">Connect to Supernote device first</div>
				</div>
			`;
            childrenEl.appendChild(errorItem);
            return;
        }

        try {
            const files = await this.batchFileManager.loadFiles();
            this.renderVirtualFiles(childrenEl, files);
        } catch (error) {
            // Add separator first
            const separator = document.createElement('div');
            // Calculate width dynamically based on parent container
            const parentContainer = childrenEl.closest('.nav-folder-children') || childrenEl.parentElement;
            const containerWidth = (parentContainer as HTMLElement)?.offsetWidth || childrenEl.offsetWidth || 290;
            separator.style.width = `${containerWidth}px`;
            separator.style.height = '0.1px';
            separator.style.marginBottom = '0px';
            childrenEl.appendChild(separator);

            // Create a proper tree-item structure for the error message
            const errorItem = document.createElement('div');
            errorItem.className = 'tree-item nav-file';
            errorItem.innerHTML = `
				<div class="tree-item-self nav-file-title" style="margin-inline-start: -17px; padding-inline-start: 41px;">
					<div class="tree-item-inner nav-file-title-content">Error loading files: ${error.message}</div>
				</div>
			`;
            childrenEl.appendChild(errorItem);
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
     * Create virtual file element (non-directory)
     */
    private createVirtualFileElementInternal(file: SupernoteFile, depth: number): HTMLElement {
        // Create the main tree-item wrapper
        const treeItemEl = document.createElement('div');
        treeItemEl.className = 'tree-item nav-file';
        treeItemEl.setAttribute('data-path', `${this.virtualFolderName}/${file.name}`);
        treeItemEl.setAttribute('data-supernote-file', 'true');

        // Create the file title section (tree-item-self)
        const fileTitleSelfEl = document.createElement('div');
        fileTitleSelfEl.className = 'tree-item-self nav-file-title tappable is-clickable';
        fileTitleSelfEl.setAttribute('data-path', `${this.virtualFolderName}/${file.name}`);
        fileTitleSelfEl.setAttribute('draggable', 'true');

        // Calculate indentation: margin = -17 * depth, padding = 24 + (17 * depth)
        const margin = -17 * depth;
        const padding = 24 + (17 * depth);
        fileTitleSelfEl.style.marginInlineStart = `${margin}px`;
        fileTitleSelfEl.style.paddingInlineStart = `${padding}px`;

        // Create the file title content
        const fileTitleContentEl = document.createElement('div');
        fileTitleContentEl.className = 'tree-item-inner nav-file-title-content';
        fileTitleContentEl.textContent = file.name;

        // Create the file tag (extension)
        const fileTagEl = document.createElement('div');
        fileTagEl.className = 'nav-file-tag';
        fileTagEl.textContent = file.extension || 'note';

        // Assemble the structure
        fileTitleSelfEl.appendChild(fileTitleContentEl);
        fileTitleSelfEl.appendChild(fileTagEl);
        treeItemEl.appendChild(fileTitleSelfEl);

        // Add click handler
        fileTitleSelfEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleFileClick(file);
        });

        // Add right-click context menu
        fileTitleSelfEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showVirtualFileContextMenu(e, file);
        });

        return treeItemEl;
    }

    /**
     * Handle virtual file click
     */
    private handleFileClick(file: SupernoteFile): void {
        // Open file in Supernote view
        this.app.workspace.openLinkText('', file.uri, true);
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
     * Show virtual file context menu
     */
    private showVirtualFileContextMenu(event: MouseEvent, file: SupernoteFile): void {
        const menu = new (this.app as any).Menu();

        if (!file.isDirectory) {
            menu.addItem((item: any) => {
                item.setTitle('Convert to PNG')
                    .setIcon('image')
                    .onClick(() => {
                        // Trigger PNG conversion
                        this.convertFile(file, 'png');
                    });
            });

            menu.addItem((item: any) => {
                item.setTitle('Convert to PDF')
                    .setIcon('file-text')
                    .onClick(() => {
                        // Trigger PDF conversion
                        this.convertFile(file, 'pdf');
                    });
            });

            menu.addSeparator();
        }

        menu.addItem((item: any) => {
            item.setTitle('Download Original')
                .setIcon('download')
                .onClick(() => {
                    // Trigger original file download
                    this.downloadFile(file);
                });
        });

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }

    /**
     * Attempt connection to Supernote device
     */
    private async attemptConnection(): Promise<void> {
        try {
            await this.batchFileManager.loadFiles();
            this.isConnected = true;
            this.updateConnectionStatus();
        } catch (error) {
            this.isConnected = false;
            this.updateConnectionStatus();
            console.error('Failed to connect to Supernote device:', error);
        }
    }

    /**
     * Convert file to specified format
     */
    private async convertFile(file: SupernoteFile, format: string): Promise<void> {
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

        const virtualFolder = fileExplorer.view.containerEl.querySelector('[data-supernote-virtual="true"]');
        if (!virtualFolder) return;

        const titleEl = virtualFolder.querySelector('.tree-item-inner.nav-folder-title-content');
        if (titleEl) {
            titleEl.textContent = `${this.virtualFolderName} ${this.isConnected ? '(Connected)' : '(Disconnected)'}`;
        }
    }

    /**
     * Clean up the virtual folder provider
     */
    cleanup(): void {
        // Remove virtual folder from file explorer
        const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
        if (fileExplorer) {
            const virtualFolder = fileExplorer.view.containerEl.querySelector('[data-supernote-virtual="true"]');
            if (virtualFolder) {
                virtualFolder.remove();
            }
        }
    }
} 