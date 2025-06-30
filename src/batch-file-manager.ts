import { App, Notice } from 'obsidian';

export interface SupernoteFile {
    name: string;
    size: number;
    date: string;
    uri: string;
    extension: string;
    isDirectory: boolean;
}

export interface SupernoteResponse {
    deviceName: string;
    fileList: SupernoteFile[];
    routeList: { name: string; path: string; }[];
    totalByteSize: number;
    totalMemory: number;
    usedMemory: number;
}

export class BatchFileManager {
    private selectedFiles: Set<SupernoteFile> = new Set();
    private currentPath: string = '/';
    private currentFiles: SupernoteFile[] = [];
    private settings: any;

    constructor(private app: App, settings: any) {
        this.settings = settings;
    }

    // File selection management
    toggleFileSelection(file: SupernoteFile): void {
        if (file.isDirectory) return;

        if (this.isFileSelected(file)) {
            this.selectedFiles.delete(file);
        } else {
            this.selectedFiles.add(file);
        }
    }

    isFileSelected(file: SupernoteFile): boolean {
        if (file.isDirectory) return false;
        // Check by file key since Set comparison uses reference equality
        return Array.from(this.selectedFiles).some(selected =>
            this.getFileKey(selected) === this.getFileKey(file)
        );
    }

    getSelectedFiles(): SupernoteFile[] {
        return Array.from(this.selectedFiles);
    }

    getSelectionCount(): number {
        return this.selectedFiles.size;
    }

    getTotalSelectedSize(): number {
        return Array.from(this.selectedFiles).reduce((total, file) => total + file.size, 0);
    }

    clearSelection(): void {
        this.selectedFiles.clear();
    }

    selectAll(): void {
        this.currentFiles.forEach(file => {
            if (!file.isDirectory) {
                this.selectedFiles.add(file);
            }
        });
    }

    // File loading and navigation
    async loadFiles(path?: string): Promise<SupernoteFile[]> {
        if (path) {
            this.currentPath = path;
        }

        try {
            const response = await fetch(`http://${this.settings.directConnectIP}:8089${this.currentPath}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch file list: ${response.statusText}`);
            }
            const html = await response.text();

            const match = html.match(/const json = '(.+?)'/);
            if (!match) {
                throw new Error("Could not find file list data");
            }

            const data: SupernoteResponse = JSON.parse(match[1]);
            this.currentFiles = data.fileList;
            return this.currentFiles;
        } catch (err) {
            new Notice(`Failed to load files: ${err.message}`);
            return [];
        }
    }

    getCurrentPath(): string {
        return this.currentPath;
    }

    navigateToDirectory(dir: SupernoteFile): void {
        if (dir.isDirectory) {
            this.currentPath = dir.uri;
            this.clearSelection(); // Clear selection when navigating
        }
    }

    navigateUp(): void {
        if (this.currentPath !== '/') {
            const pathParts = this.currentPath.split('/').filter(Boolean);
            pathParts.pop();
            this.currentPath = '/' + pathParts.join('/') + (pathParts.length > 0 ? '/' : '');
            this.clearSelection();
        }
    }

    // Utility methods
    private getFileKey(file: SupernoteFile): string {
        return `${file.uri}:${file.name}`;
    }

    formatSize(bytes: number): string {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
        if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
        return (bytes / 1073741824).toFixed(2) + ' GB';
    }
} 