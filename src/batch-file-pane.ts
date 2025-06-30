import { App, ItemView, WorkspaceLeaf, Notice, TFile, TFolder } from 'obsidian';
import { BatchFileManager, SupernoteFile } from './batch-file-manager';
import { BatchDownloader } from './batch-downloader';

export const BATCH_FILE_VIEW_TYPE = 'batch-file-pane';

export class BatchFilePane extends ItemView {
    private fileManager: BatchFileManager;
    private downloader: BatchDownloader;
    private container: HTMLElement;
    private fileTree: HTMLElement;
    private statusBar: HTMLElement;
    private loading = false;

    constructor(leaf: WorkspaceLeaf, app: App, settings: any) {
        super(leaf);
        this.fileManager = new BatchFileManager(app, settings);
        this.downloader = new BatchDownloader(app, settings);
    }

    getViewType(): string {
        return BATCH_FILE_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Supernote Files';
    }

    getIcon(): string {
        return 'folder';
    }

    async onOpen(): Promise<void> {
        this.container = this.containerEl.children[1] as HTMLElement;
        this.container.empty();
        this.container.addClass('supernote-file-pane');

        this.createHeader();
        this.createFileTree();
        this.createStatusBar();

        await this.loadFiles();
    }

    async onClose(): Promise<void> {
        // Cleanup if needed
    }

    private createHeader(): void {
        const header = this.container.createDiv('workspace-tab-header');

        // Title
        const title = header.createDiv('workspace-tab-header-inner');
        title.createEl('span', { text: 'Supernote Files', cls: 'workspace-tab-header-title' });

        // Toolbar
        const toolbar = header.createDiv('workspace-tab-header-toolbar');

        // Navigation controls
        const navGroup = toolbar.createDiv('nav-button-group');

        const upButton = navGroup.createEl('button', { cls: 'clickable-icon nav-action-button', text: 'Up' });
        upButton.setAttribute('aria-label', 'Go to parent directory');
        upButton.addEventListener('click', () => this.navigateUp());

        const refreshButton = navGroup.createEl('button', { cls: 'clickable-icon nav-action-button', text: 'Refresh' });
        refreshButton.setAttribute('aria-label', 'Refresh file list');
        refreshButton.addEventListener('click', () => this.loadFiles());

        // Selection controls
        const selectGroup = toolbar.createDiv('nav-button-group');

        const selectAllButton = selectGroup.createEl('button', { cls: 'clickable-icon nav-action-button', text: 'Select All' });
        selectAllButton.setAttribute('aria-label', 'Select all files');
        selectAllButton.addEventListener('click', () => this.selectAll());

        const clearButton = selectGroup.createEl('button', { cls: 'clickable-icon nav-action-button', text: 'Clear' });
        clearButton.setAttribute('aria-label', 'Clear selection');
        clearButton.addEventListener('click', () => this.clearSelection());

        // Action controls
        const actionGroup = toolbar.createDiv('nav-button-group');

        const downloadOriginalButton = actionGroup.createEl('button', {
            cls: 'clickable-icon nav-action-button',
            text: 'Download Originals'
        });
        downloadOriginalButton.setAttribute('aria-label', 'Download selected .note files as-is');
        downloadOriginalButton.addEventListener('click', () => this.downloadOriginals());

        // Format selection dropdown
        const formatGroup = actionGroup.createDiv('format-selection-group');
        formatGroup.style.display = 'flex';
        formatGroup.style.alignItems = 'center';
        formatGroup.style.gap = '4px';

        const formatLabel = formatGroup.createEl('span', { text: 'Convert to:', cls: 'format-label' });
        formatLabel.style.fontSize = '12px';
        formatLabel.style.color = 'var(--text-muted)';

        const formatSelect = formatGroup.createEl('select', { cls: 'format-select' });
        formatSelect.style.padding = '2px 4px';
        formatSelect.style.fontSize = '12px';
        formatSelect.style.borderRadius = '4px';
        formatSelect.style.border = '1px solid var(--background-modifier-border)';
        formatSelect.style.background = 'var(--background-primary)';
        formatSelect.style.color = 'var(--text-normal)';

        const pngOption = formatSelect.createEl('option', { value: 'png', text: 'PNG Images' });
        const pdfOption = formatSelect.createEl('option', { value: 'pdf', text: 'PDF Documents' });
        // const svgOption = formatSelect.createEl('option', { value: 'svg', text: 'SVG Vector' });

        const convertButton = actionGroup.createEl('button', {
            cls: 'clickable-icon nav-action-button mod-cta',
            text: 'Convert & Download'
        });
        convertButton.setAttribute('aria-label', 'Convert selected files to chosen format');
        convertButton.addEventListener('click', () => {
            const format = formatSelect.value;
            this.convertAndDownload(format);
        });
    }

    private createFileTree(): void {
        this.fileTree = this.container.createDiv('tree-item-children');
    }

    private createStatusBar(): void {
        this.statusBar = this.container.createDiv('status-bar-item');
        this.updateStatusBar();
    }

    private async loadFiles(): Promise<void> {
        if (this.loading) return;

        this.loading = true;
        this.updateStatusBar('Loading files...');

        try {
            const files = await this.fileManager.loadFiles();
            this.renderFileTree(files);
            this.updateStatusBar();
        } catch (error) {
            this.updateStatusBar(`Error: ${error.message}`);
        } finally {
            this.loading = false;
        }
    }

    private renderFileTree(files: SupernoteFile[]): void {
        this.fileTree.empty();

        // Show current path as breadcrumb folder if not root
        const pathParts = this.fileManager.getCurrentPath().split('/').filter(Boolean);

        if (pathParts.length > 0) {
            this.renderBreadcrumbFolder(pathParts);
        }

        // Render files and folders using Obsidian's tree structure
        files.forEach(file => {
            if (file.isDirectory) {
                this.renderObsidianFolder(file);
            } else {
                this.renderObsidianFile(file);
            }
        });
    }

    private renderBreadcrumbFolder(pathParts: string[]): void {
        const breadcrumbEl = this.fileTree.createDiv('tree-item nav-folder');
        const selfEl = breadcrumbEl.createDiv('tree-item-self nav-folder-title is-clickable');
        selfEl.style.marginInlineStart = '0px !important';
        selfEl.style.paddingInlineStart = '24px !important';

        // Collapse icon
        const iconEl = selfEl.createDiv('tree-item-icon collapse-icon');
        iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon right-triangle"><path d="M3 8L12 17L21 8"></path></svg>`;

        // Folder name
        const innerEl = selfEl.createDiv('tree-item-inner nav-folder-title-content');
        innerEl.textContent = pathParts[pathParts.length - 1];

        // Click handler
        selfEl.addEventListener('click', () => this.navigateUp());
    }

    private renderObsidianFolder(folder: SupernoteFile): void {
        const folderEl = this.fileTree.createDiv('tree-item nav-folder');
        const selfEl = folderEl.createDiv('tree-item-self nav-folder-title is-clickable mod-collapsible');
        selfEl.setAttribute('data-path', folder.uri);
        selfEl.style.marginInlineStart = '0px !important';
        selfEl.style.paddingInlineStart = '24px !important';

        // Collapse icon
        const iconEl = selfEl.createDiv('tree-item-icon collapse-icon');
        iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon right-triangle"><path d="M3 8L12 17L21 8"></path></svg>`;

        // Folder name
        const innerEl = selfEl.createDiv('tree-item-inner nav-folder-title-content');
        innerEl.textContent = folder.name;

        // Click handler
        selfEl.addEventListener('click', () => {
            this.navigateToDirectory(folder);
        });

        // Hover effects
        selfEl.addEventListener('mouseenter', () => {
            selfEl.addClass('is-hovered');
        });

        selfEl.addEventListener('mouseleave', () => {
            selfEl.removeClass('is-hovered');
        });
    }

    private renderObsidianFile(file: SupernoteFile): void {
        const fileEl = this.fileTree.createDiv('tree-item nav-file');
        const selfEl = fileEl.createDiv('tree-item-self nav-file-title tappable is-clickable');
        selfEl.setAttribute('data-path', file.uri);
        selfEl.style.marginInlineStart = '0px !important';
        selfEl.style.paddingInlineStart = '24px !important';

        // Add selection checkbox at the beginning
        const checkboxEl = selfEl.createEl('input', {
            type: 'checkbox',
            cls: 'tree-item-checkbox'
        });
        checkboxEl.checked = this.fileManager.isFileSelected(file);
        checkboxEl.style.marginRight = '8px';
        checkboxEl.addEventListener('change', (e) => {
            e.stopPropagation();
            this.fileManager.toggleFileSelection(file);
            this.updateStatusBar();
        });

        // File content
        const innerEl = selfEl.createDiv('tree-item-inner nav-file-title-content');
        innerEl.textContent = file.name.replace(/\.note$/, '');

        // File tag (extension)
        const tagEl = selfEl.createDiv('nav-file-tag');
        tagEl.textContent = 'note';

        // File size and date info
        const infoEl = selfEl.createDiv('nav-file-info');
        infoEl.textContent = `${this.fileManager.formatSize(file.size)} • ${file.date}`;
        infoEl.style.fontSize = '11px';
        infoEl.style.color = 'var(--text-muted)';
        infoEl.style.marginLeft = '8px';

        // Click handler for the entire row (except checkbox)
        selfEl.addEventListener('click', (e) => {
            if (e.target === checkboxEl) return;
            this.fileManager.toggleFileSelection(file);
            checkboxEl.checked = this.fileManager.isFileSelected(file);
            this.updateStatusBar();
        });

        // Hover effects
        selfEl.addEventListener('mouseenter', () => {
            selfEl.addClass('is-hovered');
        });

        selfEl.addEventListener('mouseleave', () => {
            selfEl.removeClass('is-hovered');
        });

        // Selection state styling
        if (this.fileManager.isFileSelected(file)) {
            selfEl.addClass('is-selected');
        }
    }

    private navigateToDirectory(dir: SupernoteFile): void {
        this.fileManager.navigateToDirectory(dir);
        this.loadFiles();
    }

    private navigateUp(): void {
        this.fileManager.navigateUp();
        this.loadFiles();
    }

    private selectAll(): void {
        this.fileManager.selectAll();
        this.updateStatusBar();
        this.refreshSelectionUI();
    }

    private clearSelection(): void {
        this.fileManager.clearSelection();
        this.updateStatusBar();
        this.refreshSelectionUI();
    }

    private refreshSelectionUI(): void {
        // Update all checkboxes to reflect current selection state
        const checkboxes = this.fileTree.querySelectorAll('.tree-item-checkbox') as NodeListOf<HTMLInputElement>;
        checkboxes.forEach((checkbox, index) => {
            const fileEl = checkbox.closest('.tree-item');
            if (fileEl) {
                const filePath = fileEl.querySelector('.tree-item-self')?.getAttribute('data-path');
                if (filePath) {
                    // Find the corresponding file and update checkbox
                    const files = this.fileManager.getSelectedFiles();
                    const isSelected = files.some(f => f.uri === filePath);
                    checkbox.checked = isSelected;

                    // Update visual selection state
                    const selfEl = checkbox.closest('.tree-item-self');
                    if (selfEl) {
                        if (isSelected) {
                            selfEl.addClass('is-selected');
                        } else {
                            selfEl.removeClass('is-selected');
                        }
                    }
                }
            }
        });
    }

    private async downloadOriginals(): Promise<void> {
        const selectedFiles = this.fileManager.getSelectedFiles();
        if (selectedFiles.length === 0) {
            new Notice('No files selected');
            return;
        }

        try {
            await this.downloader.downloadFiles(selectedFiles, (progress) => {
                this.updateStatusBar(`Downloading: ${progress.current}/${progress.total}`);
            });
            new Notice(`Downloaded ${selectedFiles.length} files`);
            this.updateStatusBar();
        } catch (error) {
            new Notice(`Download failed: ${error.message}`);
            this.updateStatusBar();
        }
    }

    private async convertAndDownload(format: string): Promise<void> {
        const selectedFiles = this.fileManager.getSelectedFiles();
        if (selectedFiles.length === 0) {
            new Notice('No files selected');
            return;
        }

        try {
            this.updateStatusBar('Converting files...');
            await this.downloader.convertAndDownload(selectedFiles, format);
            new Notice(`Converted and downloaded ${selectedFiles.length} files`);
            this.updateStatusBar();
        } catch (error) {
            new Notice(`Conversion failed: ${error.message}`);
            this.updateStatusBar();
        }
    }

    private updateStatusBar(message?: string): void {
        if (message) {
            this.statusBar.setText(message);
        } else {
            const count = this.fileManager.getSelectionCount();
            const size = this.fileManager.formatSize(this.fileManager.getTotalSelectedSize());
            this.statusBar.setText(`${count} files selected (${size})`);
        }
    }
} 