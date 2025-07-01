import { installAtPolyfill } from './polyfills';
import { App, Modal, TFile, Plugin, Editor, MarkdownView, WorkspaceLeaf, FileView, Notice } from 'obsidian';
import { SupernotePluginSettings, SupernoteSettingTab, DEFAULT_SETTINGS } from './settings';
import { SupernoteX, fetchMirrorFrame } from 'supernote';
import { DownloadListModal, UploadListModal } from './FileListModal';
import { jsPDF } from 'jspdf';
import { SupernoteWorkerMessage, SupernoteWorkerResponse } from './myworker.worker';
import Worker from 'myworker.worker';
import { replaceTextWithCustomDictionary } from './customDictionary';

import { VirtualFolderProvider } from './virtual-folder-provider';
import { BatchFileManager } from './batch-file-manager';

function generateTimestamp(): string {
	const date = new Date();
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0'); // Add leading zero for single-digit months
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');

	const timestamp = `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
	return timestamp;
}

function dataUrlToBuffer(dataUrl: string): ArrayBuffer {
	// Remove data URL prefix (e.g., "data:image/png;base64,")
	const base64 = dataUrl.split(',')[1];
	// Convert base64 to binary string
	const binaryString = atob(base64);
	// Create buffer and view
	const bytes = new Uint8Array(binaryString.length);
	// Convert binary string to buffer
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer as ArrayBuffer;
}

/**
 * Processes the Supernote text based on the provided settings.
 * 
 * @param text - The input text to be processed.
 * @param settings - The settings for the Supernote plugin.
 * @returns The processed text.
 */
export function processSupernoteText(text: string, settings: SupernotePluginSettings): string {
	let processedText = text;
	if (settings.isCustomDictionaryEnabled) {
		processedText = replaceTextWithCustomDictionary(processedText, settings.customDictionary);
	}
	return processedText;
}

export class WorkerPool {
	private workers: Worker[];

	constructor(private maxWorkers: number = navigator.hardwareConcurrency) {
		this.workers = Array(maxWorkers).fill(null).map(() =>
			new Worker()
		);
	}

	private processChunk(worker: Worker, note: SupernoteX, pageNumbers: number[], originalBuffer: Uint8Array): Promise<any[]> {
		return new Promise((resolve, reject) => {
			// const startTime = Date.now();

			worker.onmessage = (e: MessageEvent<SupernoteWorkerResponse>) => {
				// const duration = Date.now() - startTime;
				//console.log(`Processed pages ${pageNumbers.join(',')} in ${duration}ms`);

				if (e.data.error) {
					reject(new Error(e.data.error));
				} else {
					resolve(e.data.images);
				}
			};

			worker.onerror = (error) => {
				console.error('Worker error:', error);
				reject(error);
			};

			// Pass the original buffer data to the worker using transferable objects
			const message: SupernoteWorkerMessage = {
				type: 'convert',
				noteBuffer: originalBuffer.buffer.slice(0) as ArrayBuffer, // Clone and cast to ArrayBuffer
				pageNumbers
			};

			// Transfer the cloned buffer ownership to worker
			const bufferCopy = message.noteBuffer;
			worker.postMessage(message, [bufferCopy]);
		});
	}

	async processPages(note: SupernoteX, allPageNumbers: number[], originalBuffer: Uint8Array): Promise<any[]> {
		//console.time('Total processing time');

		// Split pages into chunks based on number of workers
		const chunkSize = Math.ceil(allPageNumbers.length / this.workers.length);
		const chunks: number[][] = [];

		for (let i = 0; i < allPageNumbers.length; i += chunkSize) {
			chunks.push(allPageNumbers.slice(i, i + chunkSize));
		}

		//console.log(`Processing ${allPageNumbers.length} pages in ${chunks.length} chunks`);

		// Process chunks in parallel using available workers
		const results = await Promise.all(
			chunks.map((chunk, index) =>
				this.processChunk(this.workers[index % this.workers.length], note, chunk, originalBuffer)
			)
		);

		//console.timeEnd('Total processing time');
		return results.flat();
	}

	terminate() {
		this.workers.forEach(worker => worker.terminate());
		this.workers = [];
	}
}

export class ImageConverter {
	private workerPool: WorkerPool;

	constructor(maxWorkers = navigator.hardwareConcurrency) {  // Default to 4 workers
		this.workerPool = new WorkerPool(maxWorkers);
	}

	async convertToImages(note: SupernoteX, pageNumbers?: number[], originalBuffer?: Uint8Array): Promise<any[]> {
		const pages = pageNumbers ?? Array.from({ length: note.pages.length }, (_, i) => i + 1);
		if (!originalBuffer) {
			throw new Error('Original buffer is required for image conversion');
		}
		const results = await this.workerPool.processPages(note, pages, originalBuffer);
		return results;
	}

	terminate() {
		this.workerPool.terminate();
	}
}

export class VaultWriter {
	app: App;
	settings: SupernotePluginSettings;

	constructor(app: App, settings: SupernotePluginSettings) {
		this.app = app;
		this.settings = settings;
	}

	async writeMarkdownFile(file: TFile, sn: SupernoteX, imgs: TFile[] | null) {
		let content = '';

		// Generate a non-conflicting filename - it has a bit of a race but that is OK
		let filename = `${file.parent?.path}/${file.basename}.md`;
		let i = 0;
		while (this.app.vault.getFileByPath(filename) !== null) {
			filename = `${file.parent?.path}/${file.basename} ${++i}.md`;
		}

		content = this.app.fileManager.generateMarkdownLink(file, filename);
		content += '\n';

		for (let i = 0; i < sn.pages.length; i++) {
			content += `## Page ${i + 1}\n\n`
			if (sn.pages[i].text !== undefined && sn.pages[i].text.length > 0) {
				content += `${processSupernoteText(sn.pages[i].text, this.settings)}\n`;
			}
			if (imgs) {
				let subpath = '';
				if (this.settings.invertColorsWhenDark) {
					subpath = '#supernote-invert-dark';
				}

				const link = this.app.fileManager.generateMarkdownLink(imgs[i], filename, subpath);
				content += `${link}\n`;
			}
		}

		this.app.vault.create(filename, content);
	}

	async writeImageFiles(file: TFile, sn: SupernoteX, originalBuffer: Uint8Array): Promise<TFile[]> {
		let images: string[] = [];

		const converter = new ImageConverter();
		try {
			images = await converter.convertToImages(sn, undefined, originalBuffer);
		} finally {
			// Clean up the worker when done
			converter.terminate();
		}

		const imgs: TFile[] = [];
		for (let i = 0; i < images.length; i++) {
			const filename = await this.app.fileManager.getAvailablePathForAttachment(`${file.basename}-${i}.png`);
			const buffer = dataUrlToBuffer(images[i]);
			imgs.push(await this.app.vault.createBinary(filename, buffer));
		}
		return imgs;
	}

	async attachMarkdownFile(file: TFile) {
		const note = await this.app.vault.readBinary(file);
		const sn = new SupernoteX(new Uint8Array(note));

		this.writeMarkdownFile(file, sn, null);
	}

	async attachNoteFiles(file: TFile) {
		const note = await this.app.vault.readBinary(file);
		const buffer = new Uint8Array(note);
		const sn = new SupernoteX(buffer);

		const imgs = await this.writeImageFiles(file, sn, buffer);
		this.writeMarkdownFile(file, sn, imgs);
	}

	// Extract the exact PDF generation logic into a reusable function
	async generatePDFFromSupernote(sn: SupernoteX, originalBuffer: Uint8Array): Promise<ArrayBuffer> {
		// Create PDF document
		const pdf = new jsPDF({
			orientation: 'portrait',
			unit: 'px',
			format: [sn.pageWidth, sn.pageHeight] // A4 size in pixels
		});

		// Convert note pages to images
		const converter = new ImageConverter();
		let images: string[] = [];
		try {
			images = await converter.convertToImages(sn, undefined, originalBuffer);
		} finally {
			converter.terminate();
		}

		// Add each page to PDF
		for (let i = 0; i < images.length; i++) {
			if (i > 0) {
				pdf.addPage();
			}

			if (sn.pages[i].text !== undefined && sn.pages[i].text.length > 0) {
				pdf.setFontSize(100);
				pdf.setTextColor(0, 0, 0, 0); // Transparent text
				pdf.text(processSupernoteText(sn.pages[i].text, this.settings), 20, 20, { maxWidth: sn.pageWidth });
				pdf.setTextColor(0, 0, 0, 1);
			}

			// Add image first
			pdf.addImage(images[i], 'PNG', 0, 0, sn.pageWidth, sn.pageHeight);
		}

		return pdf.output('arraybuffer');
	}

	async exportToPDF(file: TFile) {
		const note = await this.app.vault.readBinary(file);
		const buffer = new Uint8Array(note);
		const sn = new SupernoteX(buffer);

		// Use the extracted PDF generation function
		const pdfOutput = await this.generatePDFFromSupernote(sn, buffer);

		// Generate filename and save
		const filename = await this.app.fileManager.getAvailablePathForAttachment(`${file.basename}.pdf`);
		await this.app.vault.createBinary(filename, pdfOutput);
	}
}

let vw: VaultWriter;
export const VIEW_TYPE_SUPERNOTE = "supernote-view";

export class SupernoteView extends FileView {
	file: TFile;
	settings: SupernotePluginSettings;
	private displayMode: 'png' | 'pdf';
	private pdfDataUrl: string | null = null;
	private images: string[] = [];
	private sn: SupernoteX | null = null;
	private contentArea: HTMLElement | null = null;
	private pngBtn: HTMLButtonElement | null = null;
	private pdfBtn: HTMLButtonElement | null = null;

	constructor(leaf: WorkspaceLeaf, settings: SupernotePluginSettings) {
		super(leaf);
		this.settings = settings;
	}

	getViewType() {
		return VIEW_TYPE_SUPERNOTE;
	}

	getDisplayText() {
		if (!this.file) {
			return "Supernote View"
		}
		return this.file.basename;
	}

	async onLoadFile(file: TFile): Promise<void> {
		this.file = file;
		this.displayMode = this.settings.defaultDisplayMode;

		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		// Create header with file info and controls
		this.createHeader(container, file);

		// Load and parse the note file
		await this.loadNoteData(file);

		// Create the main content area
		this.createContentArea(container);

		// Render the content based on current display mode
		await this.renderContent();
	}

	private createHeader(container: HTMLElement, file: TFile): void {
		const header = container.createDiv('supernote-view-header');

		// File title
		header.createEl('h1', {
			text: file.name,
			cls: 'supernote-view-title'
		});

		// Display mode toggle
		const controlsEl = header.createDiv('supernote-view-controls');

		// Export controls
		if (this.settings.showExportButtons) {
			const exportGroup = controlsEl.createDiv('button-group');

			const exportPngBtn = exportGroup.createEl('button', {
				text: 'Export PNG',
				cls: 'mod-cta'
			});
			exportPngBtn.addEventListener('click', () => this.exportAsPng());

			const exportPdfBtn = exportGroup.createEl('button', {
				text: 'Export PDF',
				cls: 'mod-cta'
			});
			exportPdfBtn.addEventListener('click', () => this.exportAsPdf());

			const exportMarkdownBtn = exportGroup.createEl('button', {
				text: 'Export Markdown',
				cls: 'mod-cta'
			});
			exportMarkdownBtn.addEventListener('click', () => this.exportAsMarkdown());
		}
	}

	private async loadNoteData(file: TFile): Promise<void> {
		const note = await this.app.vault.readBinary(file);
		const buffer = new Uint8Array(note);
		this.sn = new SupernoteX(buffer);

		// Convert to images for PNG view
		const converter = new ImageConverter();
		try {
			this.images = await converter.convertToImages(this.sn, undefined, buffer);
		} finally {
			converter.terminate();
		}

		// Generate PDF data URL for PDF view
		if (this.sn.pages.length > 0) {
			const pdfBuffer = await vw.generatePDFFromSupernote(this.sn, buffer);
			const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
			this.pdfDataUrl = URL.createObjectURL(blob);
		}
	}

	private createContentArea(container: HTMLElement): void {
		this.contentArea = container.createDiv('supernote-view-content');
	}

	private async renderContent(): Promise<void> {
		if (!this.contentArea) return;

		this.contentArea.empty();

		if (this.displayMode === 'png') {
			await this.renderPngView();
		} else {
			await this.renderPdfView();
		}
	}

	private async renderPngView(): Promise<void> {
		if (!this.sn || !this.images.length || !this.contentArea) return;

		// Create table of contents if multiple pages
		if (this.images.length > 1 && this.settings.showTOC) {
			this.createTableOfContents();
		}

		// Render each page
		for (let i = 0; i < this.images.length; i++) {
			const pageContainer = this.contentArea.createEl("div", {
				cls: 'supernote-page-container',
			});

			// Page header with navigation
			if (this.images.length > 1) {
				this.createPageHeader(pageContainer, i);
			}

			// Page content
			const pageContent = pageContainer.createDiv('supernote-page-content');

			// Show recognized text if available
			if (this.sn.pages[i].text !== undefined && this.sn.pages[i].text.length > 0) {
				this.createTextSection(pageContent, i);
			}

			// Show page image
			this.createImageSection(pageContent, i);
		}
	}

	private async renderPdfView(): Promise<void> {
		if (!this.pdfDataUrl || !this.contentArea) return;

		const pdfContainer = this.contentArea.createDiv('supernote-pdf-container');

		pdfContainer.createEl('embed', {
			attr: {
				src: this.pdfDataUrl,
				type: 'application/pdf',
				width: '100%',
				height: '800px'
			}
		});

		// Add download link
		const downloadLink = pdfContainer.createEl('a', {
			text: 'Download PDF',
			cls: 'mod-cta'
		});
		downloadLink.href = this.pdfDataUrl;
		downloadLink.download = `${this.file.basename}.pdf`;
	}

	private createTableOfContents(): void {
		if (!this.contentArea) return;

		const tocContainer = this.contentArea.createDiv('supernote-toc-container');
		tocContainer.createEl('h2', { text: 'Table of Contents' });

		const tocList = tocContainer.createEl('ul', { cls: 'supernote-toc-list' });

		for (let i = 0; i < this.images.length; i++) {
			const tocItem = tocList.createEl('li');
			tocItem.createEl('a', {
				text: `Page ${i + 1}`,
				attr: { href: `#page-${i + 1}` }
			});
		}
	}

	private createPageHeader(container: HTMLElement, pageIndex: number): void {
		const header = container.createDiv('supernote-page-header');

		header.createEl('h3', {
			text: `Page ${pageIndex + 1}`,
			attr: { id: `page-${pageIndex + 1}` }
		});

		// Navigation buttons for multi-page documents
		if (this.images.length > 1) {
			const navGroup = header.createDiv('supernote-page-nav');

			if (pageIndex > 0) {
				const prevBtn = navGroup.createEl('button', {
					text: '← Previous',
					cls: 'mod-cta'
				});
				prevBtn.addEventListener('click', () => this.scrollToPage(pageIndex - 1));
			}

			if (pageIndex < this.images.length - 1) {
				const nextBtn = navGroup.createEl('button', {
					text: 'Next →',
					cls: 'mod-cta'
				});
				nextBtn.addEventListener('click', () => this.scrollToPage(pageIndex + 1));
			}
		}
	}

	private createTextSection(container: HTMLElement, pageIndex: number): void {
		if (!this.sn) return;

		const textContainer = container.createDiv('supernote-text-section');

		if (this.settings.collapseRecognizedText) {
			const details = textContainer.createEl('details', {
				cls: 'supernote-text-details'
			});

			details.createEl('summary', {
				text: `Page ${pageIndex + 1} Recognized Text`
			});

			details.createEl('div', {
				text: processSupernoteText(this.sn.pages[pageIndex].text, this.settings),
				cls: 'supernote-text-content'
			});
		} else {
			textContainer.createEl('div', {
				text: processSupernoteText(this.sn.pages[pageIndex].text, this.settings),
				cls: 'supernote-text-content'
			});
		}
	}

	private createImageSection(container: HTMLElement, pageIndex: number): void {
		const imageContainer = container.createDiv('supernote-image-section');

		const imgElement = imageContainer.createEl("img", {
			attr: {
				src: this.images[pageIndex],
				alt: `Page ${pageIndex + 1}`,
				draggable: 'true'
			}
		});

		// Apply styling
		imgElement.style.maxWidth = `${this.settings.noteImageMaxDim}px`;
		imgElement.style.maxHeight = `${this.settings.noteImageMaxDim}px`;

		if (this.settings.invertColorsWhenDark) {
			imgElement.addClass("supernote-invert-dark");
		}

		// Add image controls
		if (this.settings.showExportButtons) {
			const imageControls = imageContainer.createDiv('supernote-image-controls');

			const saveBtn = imageControls.createEl('button', {
				text: 'Save Image',
				cls: 'mod-cta'
			});
			saveBtn.addEventListener('click', () => this.savePageImage(pageIndex));

			const zoomBtn = imageControls.createEl('button', {
				text: 'Zoom',
				cls: 'mod-cta'
			});
			zoomBtn.addEventListener('click', () => this.zoomImage(imgElement));
		}
	}

	private switchToPngMode(): void {
		this.displayMode = 'png';
		this.updateModeButtons();
		this.renderContent();
	}

	private switchToPdfMode(): void {
		this.displayMode = 'pdf';
		this.updateModeButtons();
		this.renderContent();
	}

	private updateModeButtons(): void {
		if (this.pngBtn && this.pdfBtn) {
			this.pngBtn.className = this.displayMode === 'png' ? 'mod-cta' : '';
			this.pdfBtn.className = this.displayMode === 'pdf' ? 'mod-cta' : '';
		}
	}

	private scrollToPage(pageIndex: number): void {
		if (!this.contentArea) return;

		const targetElement = this.contentArea.querySelector(`#page-${pageIndex + 1}`);
		if (targetElement) {
			targetElement.scrollIntoView({ behavior: 'smooth' });
		}
	}

	private async savePageImage(pageIndex: number): Promise<void> {
		const filename = await this.app.fileManager.getAvailablePathForAttachment(
			`${this.file.basename}-page-${pageIndex + 1}.png`
		);
		const buffer = dataUrlToBuffer(this.images[pageIndex]);
		await this.app.vault.createBinary(filename, buffer);
		new Notice(`Saved ${filename}`);
	}

	private zoomImage(imgElement: HTMLImageElement): void {
		// Create a modal with the full-size image
		const modal = new ImageZoomModal(this.app, imgElement.src, this.file.basename);
		modal.open();
	}

	private async exportAsPng(): Promise<void> {
		if (!this.file) return;
		await vw.attachNoteFiles(this.file);
		new Notice('Exported as PNG images');
	}

	private async exportAsPdf(): Promise<void> {
		if (!this.file) return;
		await vw.exportToPDF(this.file);
		new Notice('Exported as PDF');
	}

	private async exportAsMarkdown(): Promise<void> {
		if (!this.file) return;
		await vw.attachMarkdownFile(this.file);
		new Notice('Exported as Markdown');
	}

	async onClose() {
		// Clean up PDF data URL
		if (this.pdfDataUrl) {
			URL.revokeObjectURL(this.pdfDataUrl);
		}
	}
}

// Helper modal for image zooming
class ImageZoomModal extends Modal {
	constructor(app: App, private imageSrc: string, private filename: string) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('supernote-zoom-modal');

		const container = contentEl.createDiv('supernote-zoom-container');

		const img = container.createEl('img', {
			attr: {
				src: this.imageSrc,
				alt: this.filename
			}
		});

		// Make image responsive but allow zooming
		img.style.maxWidth = '100%';
		img.style.maxHeight = '90vh';
		img.style.cursor = 'zoom-in';

		// Add zoom functionality
		let isZoomed = false;
		img.addEventListener('click', () => {
			if (isZoomed) {
				img.style.transform = 'scale(1)';
				img.style.cursor = 'zoom-in';
			} else {
				img.style.transform = 'scale(2)';
				img.style.cursor = 'zoom-out';
			}
			isZoomed = !isZoomed;
		});

		// Add close button
		const closeBtn = container.createEl('button', {
			text: 'Close',
			cls: 'mod-cta'
		});
		closeBtn.addEventListener('click', () => this.close());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export default class SupernotePlugin extends Plugin {
	settings: SupernotePluginSettings;
	private virtualFolderProvider: VirtualFolderProvider | null = null;

	async onload() {
		// Install polyfills before any other code runs
		installAtPolyfill();

		await this.loadSettings();
		vw = new VaultWriter(this.app, this.settings);

		// Initialize virtual folder provider for file explorer integration
		const batchFileManager = new BatchFileManager(this.app, this.settings);
		this.virtualFolderProvider = new VirtualFolderProvider(this.app, batchFileManager);
		await this.virtualFolderProvider.initialize();

		this.addSettingTab(new SupernoteSettingTab(this.app, this));



		// Register files menu event listener for right-click context menu
		this.registerEvent(
			this.app.workspace.on('files-menu', (menu, files: TFile[]) => {
				console.log('Files menu event triggered with files:', files.map(f => f.name));

				// Filter for .note files only
				const noteFiles = files.filter(file => file.extension === 'note');
				console.log('Note files found:', noteFiles.map(f => f.name));

				if (noteFiles.length === 0) return;

				// Ensure VaultWriter is initialized
				if (!vw) {
					console.error('VaultWriter not initialized');
					return;
				}

				console.log('Adding Supernote menu items for', noteFiles.length, 'files');

				// Add separator
				menu.addSeparator();

				// Add a simple test menu item first
				menu.addItem((item) => {
					item
						.setTitle(`Supernote: ${noteFiles.length} file${noteFiles.length > 1 ? 's' : ''} selected`)
						.setIcon('file-text')
						.onClick(() => {
							new Notice(`Supernote menu clicked for ${noteFiles.length} file${noteFiles.length > 1 ? 's' : ''}`);
						});
				});

				// Add Supernote menu items
				menu.addItem((item) => {
					item
						.setTitle(`Attach ${noteFiles.length > 1 ? 'all' : 'as'} PNG images`)
						.setIcon('image')
						.onClick(async () => {
							try {
								for (const file of noteFiles) {
									await vw.attachNoteFiles(file);
								}
								new Notice(`Attached ${noteFiles.length} file${noteFiles.length > 1 ? 's' : ''} as PNG images`);
							} catch (err: any) {
								new ErrorModal(this.app, err).open();
							}
						});
				});

				menu.addItem((item) => {
					item
						.setTitle(`Attach ${noteFiles.length > 1 ? 'all' : 'as'} PDF`)
						.setIcon('file-text')
						.onClick(async () => {
							try {
								for (const file of noteFiles) {
									await vw.exportToPDF(file);
								}
								new Notice(`Attached ${noteFiles.length} file${noteFiles.length > 1 ? 's' : ''} as PDF`);
							} catch (err: any) {
								new ErrorModal(this.app, err).open();
							}
						});
				});

				menu.addItem((item) => {
					item
						.setTitle(`Attach ${noteFiles.length > 1 ? 'all' : 'as'} Markdown`)
						.setIcon('document')
						.onClick(async () => {
							try {
								for (const file of noteFiles) {
									await vw.attachMarkdownFile(file);
								}
								new Notice(`Attached ${noteFiles.length} file${noteFiles.length > 1 ? 's' : ''} as Markdown`);
							} catch (err: any) {
								new ErrorModal(this.app, err).open();
							}
						});
				});

				// Add separator for advanced options
				menu.addSeparator();

				// Open in Supernote viewer (only for single file)
				if (noteFiles.length === 1) {
					menu.addItem((item) => {
						item
							.setTitle('Open in Supernote viewer')
							.setIcon('eye')
							.onClick(async () => {
								const leaf = this.app.workspace.getRightLeaf(false);
								if (leaf) {
									await leaf.setViewState({
										type: VIEW_TYPE_SUPERNOTE,
										active: true,
										state: { file: noteFiles[0].path }
									});
									this.app.workspace.revealLeaf(leaf);
								}
							});
					});
				}
			})
		);

		// Register file menu event listener for single file right-click context menu
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file: TFile) => {
				console.log('File menu event triggered with file:', file.name);

				// Check if it's a .note file
				if (file.extension !== 'note') return;

				// Ensure VaultWriter is initialized
				if (!vw) {
					console.error('VaultWriter not initialized');
					return;
				}

				console.log('Adding Supernote menu items for single file:', file.name);

				// Add separator
				menu.addSeparator();

				// Add a simple test menu item first
				menu.addItem((item) => {
					item
						.setTitle('Supernote: Single file selected')
						.setIcon('file-text')
						.onClick(() => {
							new Notice(`Supernote menu clicked for ${file.name}`);
						});
				});

				// Add Supernote menu items
				menu.addItem((item) => {
					item
						.setTitle('Attach as PNG images')
						.setIcon('image')
						.onClick(async () => {
							try {
								await vw.attachNoteFiles(file);
								new Notice(`Attached ${file.name} as PNG images`);
							} catch (err: any) {
								new ErrorModal(this.app, err).open();
							}
						});
				});

				menu.addItem((item) => {
					item
						.setTitle('Attach as PDF')
						.setIcon('file-text')
						.onClick(async () => {
							try {
								await vw.exportToPDF(file);
								new Notice(`Attached ${file.name} as PDF`);
							} catch (err: any) {
								new ErrorModal(this.app, err).open();
							}
						});
				});

				menu.addItem((item) => {
					item
						.setTitle('Attach as Markdown')
						.setIcon('document')
						.onClick(async () => {
							try {
								await vw.attachMarkdownFile(file);
								new Notice(`Attached ${file.name} as Markdown`);
							} catch (err: any) {
								new ErrorModal(this.app, err).open();
							}
						});
				});

				// Add separator for advanced options
				menu.addSeparator();

				// Open in Supernote viewer
				menu.addItem((item) => {
					item
						.setTitle('Open in Supernote viewer')
						.setIcon('eye')
						.onClick(async () => {
							const leaf = this.app.workspace.getRightLeaf(false);
							if (leaf) {
								await leaf.setViewState({
									type: VIEW_TYPE_SUPERNOTE,
									active: true,
									state: { file: file.path }
								});
								this.app.workspace.revealLeaf(leaf);
							}
						});
				});
			})
		);

		this.addCommand({
			id: 'attach-supernote-file-from-device',
			name: 'Attach Supernote file from device',
			callback: () => {
				if (this.settings.directConnectIP.length === 0) {
					new DirectConnectErrorModal(this.app, this.settings, new Error("IP is unset")).open();
					return;
				}
				new DownloadListModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'upload-file-to-supernote',
			name: 'Upload the current file to a Supernote device',
			callback: () => {
				if (this.settings.directConnectIP.length === 0) {
					new DirectConnectErrorModal(this.app, this.settings, new Error("IP is unset")).open();
					return;
				}
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					new UploadListModal(this.app, this, activeFile).open();
				}
			}
		});

		// Supernote connection and management commands

		this.addCommand({
			id: 'supernote-connect-device',
			name: 'Connect to Supernote Device',
			callback: async () => {
				if (this.settings.directConnectIP.length === 0) {
					new DirectConnectErrorModal(this.app, this.settings, new Error("IP is unset")).open();
					return;
				}
				if (this.virtualFolderProvider) {
					await this.virtualFolderProvider.connectToDevice();
					new Notice('Connecting to Supernote device...');
				}
			}
		});

		this.addCommand({
			id: 'supernote-check-status',
			name: 'Check Supernote Connection Status',
			callback: () => {
				if (this.virtualFolderProvider) {
					const status = this.virtualFolderProvider.getConnectionStatus();
					let message = `Status: ${status.state}`;
					if (status.error) {
						message += ` - ${status.error}`;
					}
					new Notice(message);
				}
			}
		});

		this.addCommand({
			id: 'supernote-refresh-folder',
			name: 'Refresh Supernote Virtual Folder',
			callback: async () => {
				if (this.settings.directConnectIP.length === 0) {
					new DirectConnectErrorModal(this.app, this.settings, new Error("IP is unset")).open();
					return;
				}
				if (this.virtualFolderProvider) {
					await this.virtualFolderProvider.refreshVirtualFolder();
					new Notice('Refreshing Supernote folder...');
				}
			}
		});

		this.addCommand({
			id: 'supernote-expand-folder',
			name: 'Expand Supernote Virtual Folder',
			callback: () => {
				if (this.virtualFolderProvider) {
					this.virtualFolderProvider.expandVirtualFolder();
				}
			}
		});



		this.addCommand({
			id: 'supernote-open-settings',
			name: 'Open Supernote Plugin Settings',
			callback: () => {
				(this.app as any).setting.open();
				(this.app as any).setting.openTabById('supernote');
			}
		});



		this.registerView(
			VIEW_TYPE_SUPERNOTE,
			(leaf) => new SupernoteView(leaf, this.settings)
		);
		this.registerExtensions(['note'], VIEW_TYPE_SUPERNOTE);

		this.addCommand({
			id: 'insert-supernote-screen-mirror-image',
			name: 'Insert a Supernote screen mirroring image as attachment',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				// generate a unique filename for the mirror based on the current note path
				const ts = generateTimestamp();
				const f = this.app.workspace.activeEditor?.file?.basename || '';
				const filename = await this.app.fileManager.getAvailablePathForAttachment(`supernote-mirror-${f}-${ts}.png`);

				try {
					if (this.settings.directConnectIP.length == 0) {
						throw new Error("IP is unset, please set in Supernote plugin settings")
					}
					const image = await fetchMirrorFrame(`${this.settings.directConnectIP}:8080`);

					const file = await this.app.vault.createBinary(filename, image.toBuffer() as unknown as ArrayBuffer);
					const path = this.app.workspace.activeEditor?.file?.path;
					if (!path) {
						throw new Error("Active file path is null")
					}
					const link = this.app.fileManager.generateMarkdownLink(file, path);
					editor.replaceRange(link, editor.getCursor());
				} catch (err: any) {
					new DirectConnectErrorModal(this.app, this.settings, err).open();
				}
			},
		});

		this.addCommand({
			id: 'export-supernote-note-as-files',
			name: 'Export this Supernote note as a markdown and PNG files as attachments',
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				const ext = file?.extension;

				if (ext === "note") {
					if (checking) {
						return true
					}
					try {
						if (!file) {
							throw new Error("No file to attach");
						}
						vw.attachNoteFiles(file);
					} catch (err: any) {
						new ErrorModal(this.app, err).open();
					}
					return true;
				}

				return false;
			},
		});

		this.addCommand({
			id: 'export-supernote-note-as-pdf',
			name: 'Export this Supernote note as PDF',
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				const ext = file?.extension;

				if (ext === "note") {
					if (checking) {
						return true
					}
					try {
						if (!file) {
							throw new Error("No file to attach");
						}
						vw.exportToPDF(file);
					} catch (err: any) {
						new ErrorModal(this.app, err).open();
					}
					return true;
				}

				return false;
			},
		});

		this.addCommand({
			id: 'export-supernote-note-as-markdown',
			name: 'Export this Supernote note as a markdown file attachment',
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				const ext = file?.extension;

				if (ext === "note") {
					if (checking) {
						return true
					}
					try {
						if (!file) {
							throw new Error("No file to attach");
						}
						vw.attachMarkdownFile(file);
					} catch (err: any) {
						new ErrorModal(this.app, err).open();
					}
					return true;
				}

				return false;
			},
		});
	}

	onunload() {
		// Clean up virtual folder provider
		if (this.virtualFolderProvider) {
			this.virtualFolderProvider.cleanup();
		}
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_SUPERNOTE);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			leaf = workspace.getRightLeaf(false);
			if (!leaf) {
				throw new Error("leaf is null");
			}
			await leaf.setViewState({ type: VIEW_TYPE_SUPERNOTE, active: true });
		}

		// "Reveal" the leaf in case it is in a collapsed sidebar
		workspace.revealLeaf(leaf);
	}



	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}


class DirectConnectErrorModal extends Modal {
	error: Error;
	public settings: SupernotePluginSettings;

	constructor(app: App, settings: SupernotePluginSettings, error: Error) {
		super(app);
		this.error = error;
		this.settings = settings;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText(`Error: ${this.error.message}. Is the Supernote connected to Wifi on IP ${this.settings.directConnectIP} and running Screen Mirroring?`);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ErrorModal extends Modal {
	error: Error;
	settings: SupernotePluginSettings;

	constructor(app: App, error: Error) {
		super(app);
		this.error = error;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText(`Error: ${this.error.message}.`);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
