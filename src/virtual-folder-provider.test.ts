import { VirtualFolderProvider } from './virtual-folder-provider';
import { BatchFileManager } from './batch-file-manager';
import { SupernoteFile } from './batch-file-manager';

// Mock Obsidian App
const mockApp = {
    workspace: {
        onLayoutReady: jest.fn((callback) => callback()),
        on: jest.fn(),
        getLeavesOfType: jest.fn(() => [{
            view: {
                containerEl: {
                    querySelector: jest.fn(() => ({
                        insertBefore: jest.fn(),
                        firstChild: null
                    }))
                }
            }
        }])
    }
} as any;

// Mock BatchFileManager
const mockBatchFileManager = {
    loadFiles: jest.fn(),
    navigateToDirectory: jest.fn()
} as any;

describe('VirtualFolderProvider', () => {
    let provider: VirtualFolderProvider;

    beforeEach(() => {
        jest.clearAllMocks();
        provider = new VirtualFolderProvider(mockApp, mockBatchFileManager);
    });

    describe('initialization', () => {
        it('should initialize successfully', async () => {
            await expect(provider.initialize()).resolves.not.toThrow();
        });

        it('should register virtual folder on layout ready', async () => {
            await provider.initialize();
            expect(mockApp.workspace.onLayoutReady).toHaveBeenCalled();
        });

        it('should set up connection status monitoring', async () => {
            await provider.initialize();
            expect(mockApp.workspace.on).toHaveBeenCalledWith('file-explorer:refresh', expect.any(Function));
        });
    });

    describe('virtual folder creation', () => {
        it('should create virtual folder element with correct structure', () => {
            const folderEl = (provider as any).createVirtualFolderElement();

            expect(folderEl.className).toBe('nav-folder mod-root');
            expect(folderEl.getAttribute('data-path')).toBe('Supernote Device');
            expect(folderEl.getAttribute('data-supernote-virtual')).toBe('true');

            const titleEl = folderEl.querySelector('.nav-folder-title');
            expect(titleEl).toBeTruthy();

            const childrenEl = folderEl.querySelector('.nav-folder-children');
            expect(childrenEl).toBeTruthy();
        });

        it('should show connection status in folder title', () => {
            const folderEl = (provider as any).createVirtualFolderElement();
            const titleContent = folderEl.querySelector('.nav-folder-title-content');

            expect(titleContent.innerHTML).toContain('Supernote Device');
            expect(titleContent.innerHTML).toContain('(Disconnected)');
        });
    });

    describe('file element creation', () => {
        const mockFile: SupernoteFile = {
            name: 'test.note',
            size: 1024,
            date: '2024-01-01',
            uri: '/test.note',
            extension: 'note',
            isDirectory: false
        };

        it('should create file element with correct structure', () => {
            const fileEl = (provider as any).createVirtualFileElement(mockFile);

            expect(fileEl.className).toBe('nav-file');
            expect(fileEl.getAttribute('data-path')).toBe('Supernote Device/test.note');
            expect(fileEl.getAttribute('data-supernote-file')).toBe('true');

            const titleEl = fileEl.querySelector('.nav-file-title');
            expect(titleEl).toBeTruthy();
        });

        it('should show file name correctly', () => {
            const fileEl = (provider as any).createVirtualFileElement(mockFile);
            const titleContent = fileEl.querySelector('.nav-file-title-content');

            expect(titleContent.textContent).toContain('test.note');
        });

        it('should show folder name correctly', () => {
            const dirFile: SupernoteFile = { ...mockFile, isDirectory: true };
            const fileEl = (provider as any).createVirtualFileElement(dirFile);
            const titleContent = fileEl.querySelector('.nav-file-title-content');

            expect(titleContent.textContent).toContain('test.note');
        });
    });

    describe('error handling', () => {
        it('should handle connection failures gracefully', async () => {
            mockBatchFileManager.loadFiles.mockRejectedValue(new Error('Connection failed'));

            await provider.initialize();

            // Should not throw during initialization
            expect(mockBatchFileManager.loadFiles).toHaveBeenCalled();
        });

        it('should handle file loading errors', async () => {
            const childrenEl = document.createElement('div');
            mockBatchFileManager.loadFiles.mockRejectedValue(new Error('Network error'));

            await (provider as any).loadVirtualFiles(childrenEl);

            expect(childrenEl.innerHTML).toContain('Error loading files: Network error');
        });
    });

    describe('cleanup', () => {
        it('should clean up virtual folder on cleanup', () => {
            const mockQuerySelector = jest.fn(() => ({
                remove: jest.fn()
            }));
            mockApp.workspace.getLeavesOfType.mockReturnValue([{
                view: {
                    containerEl: {
                        querySelector: mockQuerySelector
                    }
                }
            }]);

            provider.cleanup();

            expect(mockQuerySelector).toHaveBeenCalledWith('[data-supernote-virtual="true"]');
        });
    });
}); 