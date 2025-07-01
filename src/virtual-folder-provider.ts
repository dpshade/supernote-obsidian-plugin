import { App, TAbstractFile, TFolder, TFile, FileView, WorkspaceLeaf, ItemView, ViewStateResult } from 'obsidian';
import { SupernoteFile, BatchFileManager } from './batch-file-manager';

export interface VirtualSupernoteFile extends TFile {
    supernoteFile: SupernoteFile;
    isVirtual: true;
}

export class VirtualFolderProvider {
    private app: App;
    private batchFileManager: BatchFileManager;
    private virtualFolderName = '📱 Supernote Device';
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
            this.injectVirtualFolder();

            // Set up periodic refresh for virtual folder to ensure it stays visible
            setInterval(() => {
                this.injectVirtualFolder();
            }, 10000); // Check every 10 seconds
        });
    }

    /**
 * Inject the virtual folder into the file explorer
 */
    private injectVirtualFolder(): void {
        const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
        if (!fileExplorer) return;

        const fileExplorerView = fileExplorer.view as any;
        if (!fileExplorerView) return;

        // Check if virtual folder already exists
        const existingVirtualFolder = fileExplorer.view.containerEl.querySelector('[data-supernote-virtual="true"]');
        if (existingVirtualFolder) return;

        // Create virtual folder element
        const virtualFolder = this.createVirtualFolderElement();

        // Insert at the top of the file explorer
        const fileExplorerContainer = fileExplorer.view.containerEl.querySelector('.nav-folder-children');
        if (fileExplorerContainer) {
            fileExplorerContainer.insertBefore(virtualFolder, fileExplorerContainer.firstChild);
        }
    }

    /**
 * Create the virtual folder element
 */
    private createVirtualFolderElement(): HTMLElement {
        // Create the main tree-item wrapper
        const treeItemEl = document.createElement('div');
        treeItemEl.className = 'tree-item nav-folder';
        treeItemEl.setAttribute('data-path', this.virtualFolderName);
        treeItemEl.setAttribute('data-supernote-virtual', 'true');

        // Create the folder title section (tree-item-self)
        const folderTitleSelfEl = document.createElement('div');
        folderTitleSelfEl.className = 'tree-item-self nav-folder-title is-clickable mod-collapsible';
        folderTitleSelfEl.setAttribute('data-path', this.virtualFolderName);
        folderTitleSelfEl.setAttribute('draggable', 'true');
        folderTitleSelfEl.style.marginInlineStart = '0px !important';
        folderTitleSelfEl.style.paddingInlineStart = '24px !important';

        // Create the collapse icon
        const collapseIconEl = document.createElement('div');
        collapseIconEl.className = 'tree-item-icon collapse-icon';
        collapseIconEl.innerHTML = `
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon right-triangle">
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
        const collapseIcon = folderEl.querySelector('.collapse-icon svg') as HTMLElement;

        if (isExpanded) {
            // Collapse
            folderEl.removeAttribute('data-expanded');
            childrenEl.style.display = 'none';
            if (collapseIcon) {
                collapseIcon.style.transform = 'rotate(0deg)';
            }
        } else {
            // Expand and load files
            folderEl.setAttribute('data-expanded', 'true');
            childrenEl.style.display = 'block';
            if (collapseIcon) {
                collapseIcon.style.transform = 'rotate(90deg)';
            }
            await this.loadVirtualFiles(childrenEl);
        }
    }

    /**
 * Load virtual files into the folder
 */
    private async loadVirtualFiles(childrenEl: HTMLElement): Promise<void> {
        if (!this.isConnected) {
            // Create a proper tree-item structure for the error message
            const errorItem = document.createElement('div');
            errorItem.className = 'tree-item nav-file';
            errorItem.innerHTML = `
				<div class="tree-item-self nav-file-title">
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
            // Create a proper tree-item structure for the error message
            const errorItem = document.createElement('div');
            errorItem.className = 'tree-item nav-file';
            errorItem.innerHTML = `
				<div class="tree-item-self nav-file-title">
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

        files.forEach(file => {
            const fileEl = this.createVirtualFileElement(file);
            childrenEl.appendChild(fileEl);
        });
    }

    /**
 * Create virtual file element
 */
    private createVirtualFileElement(file: SupernoteFile): HTMLElement {
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
        fileTitleSelfEl.style.marginInlineStart = '-17px !important';
        fileTitleSelfEl.style.paddingInlineStart = '41px !important';

        // Create the file title content
        const fileTitleContentEl = document.createElement('div');
        fileTitleContentEl.className = 'tree-item-inner nav-file-title-content';
        fileTitleContentEl.textContent = file.name;

        // Create the file tag (extension)
        const fileTagEl = document.createElement('div');
        fileTagEl.className = 'nav-file-tag';
        fileTagEl.textContent = file.isDirectory ? 'folder' : file.extension || 'note';

        // Assemble the structure
        fileTitleSelfEl.appendChild(fileTitleContentEl);
        fileTitleSelfEl.appendChild(fileTagEl);
        treeItemEl.appendChild(fileTitleSelfEl);

        // Add click handler
        fileTitleSelfEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (file.isDirectory) {
                this.navigateToDirectory(file);
            } else {
                this.handleFileClick(file);
            }
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