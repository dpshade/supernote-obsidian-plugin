import { App, Notice, TFile, normalizePath } from 'obsidian';
import { SupernoteFile } from './batch-file-manager';
// @ts-ignore
import { SupernoteX } from 'supernote-typescript';
import { VaultWriter, ImageConverter } from './main';

export interface DownloadProgress {
    current: number;
    total: number;
    fileName: string;
    status: 'downloading' | 'converting' | 'saving' | 'complete' | 'error';
}

export interface BatchDownloadResult {
    successful: SupernoteFile[];
    failed: { file: SupernoteFile; error: string }[];
}

export class BatchDownloader {
    private app: App;
    private settings: any;
    private maxConcurrent = 3;
    private vaultWriter: VaultWriter;

    constructor(app: App, settings: any) {
        this.app = app;
        this.settings = settings;
        this.vaultWriter = new VaultWriter(app, settings);
    }

    async downloadFiles(
        files: SupernoteFile[],
        onProgress?: (progress: DownloadProgress) => void
    ): Promise<BatchDownloadResult> {
        const result: BatchDownloadResult = {
            successful: [],
            failed: []
        };

        // Process files in batches to avoid overwhelming the connection
        for (let i = 0; i < files.length; i += this.maxConcurrent) {
            const batch = files.slice(i, i + this.maxConcurrent);
            const promises = batch.map(async (file, index) => {
                const overallIndex = i + index;
                try {
                    onProgress?.({
                        current: overallIndex + 1,
                        total: files.length,
                        fileName: file.name,
                        status: 'downloading'
                    });

                    await this.downloadOriginalFile(file, overallIndex + 1, files.length, onProgress);
                    result.successful.push(file);
                } catch (error) {
                    result.failed.push({ file, error: error.message });
                }
            });

            await Promise.all(promises);
        }

        return result;
    }

    private async downloadOriginalFile(
        file: SupernoteFile,
        current: number,
        total: number,
        onProgress?: (progress: DownloadProgress) => void
    ): Promise<void> {
        // Download the .note file as-is
        onProgress?.({
            current,
            total,
            fileName: file.name,
            status: 'downloading'
        });

        const response = await fetch(`http://${this.settings.directConnectIP}:8089${file.uri}`);
        if (!response.ok) {
            throw new Error(`Failed to download ${file.name}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        // Save original file to attachments
        onProgress?.({
            current,
            total,
            fileName: file.name,
            status: 'saving'
        });

        await this.saveFileToAttachments(file.name, new Uint8Array(arrayBuffer));

        onProgress?.({
            current,
            total,
            fileName: file.name,
            status: 'complete'
        });
    }

    async convertAndDownload(files: SupernoteFile[], format: string): Promise<void> {
        if (files.length === 0) {
            new Notice('No files selected');
            return;
        }

        try {
            const result = await this.convertFiles(files, format, (progress) => {
                new Notice(`Converting: ${progress.fileName} (${progress.current}/${progress.total})`, 2000);
            });

            const successCount = result.successful.length;
            const failCount = result.failed.length;

            if (successCount > 0) {
                new Notice(`✅ Successfully converted ${successCount} file${successCount > 1 ? 's' : ''} to ${format.toUpperCase()}`);
            }

            if (failCount > 0) {
                new Notice(`❌ Failed to convert ${failCount} file${failCount > 1 ? 's' : ''}`);
                console.error('Failed conversions:', result.failed);
            }

        } catch (error) {
            new Notice(`❌ Conversion failed: ${error.message}`);
            console.error('Batch conversion error:', error);
        }
    }

    async convertFiles(
        files: SupernoteFile[],
        format: string,
        onProgress?: (progress: DownloadProgress) => void
    ): Promise<BatchDownloadResult> {
        const result: BatchDownloadResult = {
            successful: [],
            failed: []
        };

        // Process files in batches to avoid overwhelming the connection
        for (let i = 0; i < files.length; i += this.maxConcurrent) {
            const batch = files.slice(i, i + this.maxConcurrent);
            const promises = batch.map(async (file, index) => {
                const overallIndex = i + index;
                try {
                    onProgress?.({
                        current: overallIndex + 1,
                        total: files.length,
                        fileName: file.name,
                        status: 'downloading'
                    });

                    await this.convertSingleFile(file, format, overallIndex + 1, files.length, onProgress);
                    result.successful.push(file);
                } catch (error) {
                    result.failed.push({ file, error: error.message });
                }
            });

            await Promise.all(promises);
        }

        return result;
    }

    private async convertSingleFile(
        file: SupernoteFile,
        format: string,
        current: number,
        total: number,
        onProgress?: (progress: DownloadProgress) => void
    ): Promise<void> {
        // Download the .note file
        onProgress?.({
            current,
            total,
            fileName: file.name,
            status: 'downloading'
        });

        const response = await fetch(`http://${this.settings.directConnectIP}:8089${file.uri}`);
        if (!response.ok) {
            throw new Error(`Failed to download ${file.name}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Convert to images
        onProgress?.({
            current,
            total,
            fileName: file.name,
            status: 'converting'
        });

        try {
            let supernote: SupernoteX;

            // Parse SuperNote file with error handling
            try {
                supernote = new SupernoteX(uint8Array);
            } catch (parseError) {
                throw new Error(`Failed to parse SuperNote file: ${parseError.message}`);
            }

            // Add validation for parsed SuperNote structure
            if (!supernote.pages || !Array.isArray(supernote.pages)) {
                throw new Error(`Invalid SuperNote file structure: pages array is missing or invalid`);
            }

            console.log(`Processing ${file.name}: ${supernote.pages.length} pages found`);

            const baseName = file.name.replace(/\.note$/, '');

            if (format === 'png') {
                // For PNG: Use the exact same approach as the working VaultWriter
                const converter = new ImageConverter();
                let images: string[] = [];
                try {
                    images = await converter.convertToImages(supernote);
                } finally {
                    converter.terminate();
                }

                // Save each image using the same method as VaultWriter
                for (let i = 0; i < images.length; i++) {
                    const pageNumber = images.length > 1 ? `-${i}` : '';
                    const fileName = `${baseName}${pageNumber}.png`;

                    onProgress?.({
                        current,
                        total,
                        fileName: `${file.name} (${i + 1}/${images.length})`,
                        status: 'saving'
                    });

                    const pngData = this.dataUrlToBuffer(images[i]);
                    await this.saveFileToAttachments(fileName, pngData);
                }

                console.log(`Generated ${images.length} PNG files for ${file.name}`);
            } else if (format === 'pdf') {
                // For PDF: use the EXACT same working code from VaultWriter
                onProgress?.({
                    current,
                    total,
                    fileName: file.name,
                    status: 'saving'
                });

                const pdfData = await this.vaultWriter.generatePDFFromSupernote(supernote);
                const fileName = `${baseName}.pdf`;
                await this.saveFileToAttachments(fileName, new Uint8Array(pdfData));
            } else {
                throw new Error(`Unsupported format: ${format}`);
            }

        } catch (error) {
            throw new Error(`Conversion failed for ${file.name}: ${error.message}`);
        }

        onProgress?.({
            current,
            total,
            fileName: file.name,
            status: 'complete'
        });
    }

    private dataUrlToBuffer(dataUrl: string): Uint8Array {
        // Same function as the original author uses in main.ts
        const base64 = dataUrl.split(',')[1];
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    private async saveFileToAttachments(fileName: string, fileData: Uint8Array): Promise<void> {
        try {
            // Use Obsidian's file manager to get the proper attachment path
            const attachmentPath = await this.app.fileManager.getAvailablePathForAttachment(fileName);

            // Convert Uint8Array to ArrayBuffer
            const arrayBuffer = new ArrayBuffer(fileData.length);
            const view = new Uint8Array(arrayBuffer);
            view.set(fileData);

            // Save the file using Obsidian's vault API
            await this.app.vault.createBinary(attachmentPath, arrayBuffer);

            new Notice(`Saved: ${attachmentPath.split('/').pop()}`);
        } catch (error) {
            throw new Error(`Failed to save ${fileName}: ${error.message}`);
        }
    }

    // Alias methods for the pane
    async convertToPDFs(files: SupernoteFile[]): Promise<void> {
        await this.convertAndDownload(files, 'pdf');
    }

    async convertAndSave(files: SupernoteFile[]): Promise<void> {
        await this.convertAndDownload(files, 'png');
    }

    // Keep the old method for backward compatibility but rename it
    async createBatchPDF(files: SupernoteFile[]): Promise<void> {
        new Notice('Creating combined PDF is not implemented yet. Use "Convert to Individual PDFs" instead.');
    }

    // Rename the old method to be clearer
    async attachAllAsPDF(files: SupernoteFile[]): Promise<void> {
        await this.convertAndDownload(files, 'pdf');
    }

    /**
     * Get download statistics
     */
    getDownloadStats(results: BatchDownloadResult): {
        total: number;
        successful: number;
        failed: number;
        errors: string[];
    } {
        const successful = results.successful.length;
        const failed = results.failed.length;
        const errors = results.failed.map(f => f.error).filter((error): error is string => !!error);

        return {
            total: successful + failed,
            successful,
            failed,
            errors
        };
    }
} 