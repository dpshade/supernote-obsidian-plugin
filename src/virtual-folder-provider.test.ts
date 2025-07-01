import { VirtualFolderProvider } from './virtual-folder-provider';

// Mock SupernoteFile interface
interface SupernoteFile {
    name: string;
    uri: string;
    isDirectory: boolean;
    extension?: string;
}

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
    },
    vault: {
        createBinary: jest.fn()
    }
} as any;

// Mock BatchFileManager
const mockBatchFileManager = {
    loadFiles: jest.fn(),
    navigateToDirectory: jest.fn(),
    getCurrentPath: jest.fn().mockReturnValue('/'),
    loadDirectoryFiles: jest.fn(),
    settings: {
        directConnectIP: '192.168.1.100'
    }
} as any;

describe('VirtualFolderProvider', () => {
    let provider: VirtualFolderProvider;

    beforeEach(() => {
        jest.clearAllMocks();
        const mockApp = {
            workspace: {
                getLeavesOfType: jest.fn().mockReturnValue([{
                    view: {
                        containerEl: document.createElement('div')
                    }
                }]),
                onLayoutReady: jest.fn(),
                on: jest.fn()
            },
            vault: {
                createBinary: jest.fn()
            }
        } as any;

        const mockBatchFileManager = {
            getCurrentPath: jest.fn().mockReturnValue('/'),
            loadFiles: jest.fn(),
            loadDirectoryFiles: jest.fn(),
            navigateToDirectory: jest.fn(),
            settings: {
                directConnectIP: '192.168.1.100'
            }
        } as any;

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

    describe('Selection Management', () => {
        it('should toggle file selection correctly', () => {
            const filePath = 'Supernote Device/test.note';

            // Initially not selected
            expect((provider as any).selectedFiles.has(filePath)).toBe(false);

            // Toggle selection on
            (provider as any).toggleFileSelection(filePath);
            expect((provider as any).selectedFiles.has(filePath)).toBe(true);

            // Toggle selection off
            (provider as any).toggleFileSelection(filePath);
            expect((provider as any).selectedFiles.has(filePath)).toBe(false);
        });

        it('should clear all selections', () => {
            const filePath1 = 'Supernote Device/test1.note';
            const filePath2 = 'Supernote Device/test2.note';

            // Add some selections
            (provider as any).selectedFiles.add(filePath1);
            (provider as any).selectedFiles.add(filePath2);
            expect((provider as any).selectedFiles.size).toBe(2);

            // Clear selections
            (provider as any).clearSelection();
            expect((provider as any).selectedFiles.size).toBe(0);
        });

        it('should update selection mode correctly', () => {
            const filePath = 'Supernote Device/test.note';

            // Initially not in selection mode
            expect((provider as any).selectionMode).toBe(false);

            // Add selection
            (provider as any).selectedFiles.add(filePath);
            (provider as any).updateSelectionMode();
            expect((provider as any).selectionMode).toBe(true);

            // Clear selection
            (provider as any).selectedFiles.clear();
            (provider as any).updateSelectionMode();
            expect((provider as any).selectionMode).toBe(false);
        });
    });

    describe('File Click Handling', () => {
        it('should handle single click selection', () => {
            const mockFile: SupernoteFile = {
                name: 'test.note',
                uri: '/test.note',
                isDirectory: false,
                extension: 'note'
            };

            const mockEvent = {
                ctrlKey: false,
                metaKey: false,
                shiftKey: false,
                stopPropagation: jest.fn()
            } as any;

            // Mock DOM elements
            document.body.innerHTML = `
                <div data-file-path="Supernote Device/test.note" class="nav-file-title"></div>
            `;

            (provider as any).handleFileClick(mockFile, mockEvent);

            expect((provider as any).selectedFiles.has('Supernote Device/test.note')).toBe(true);
        });

        it('should handle Ctrl/Cmd + click for toggle selection', () => {
            const mockFile: SupernoteFile = {
                name: 'test.note',
                uri: '/test.note',
                isDirectory: false,
                extension: 'note'
            };

            const mockEvent = {
                ctrlKey: true,
                metaKey: false,
                shiftKey: false,
                stopPropagation: jest.fn()
            } as any;

            // Mock DOM elements
            document.body.innerHTML = `
                <div data-file-path="Supernote Device/test.note" class="nav-file-title"></div>
            `;

            // First click should select
            (provider as any).handleFileClick(mockFile, mockEvent);
            expect((provider as any).selectedFiles.has('Supernote Device/test.note')).toBe(true);

            // Second Ctrl+click should deselect
            (provider as any).handleFileClick(mockFile, mockEvent);
            expect((provider as any).selectedFiles.has('Supernote Device/test.note')).toBe(false);
        });

        it('should handle double-click to open files', () => {
            const mockFile: SupernoteFile = {
                name: 'test.note',
                uri: '/test.note',
                isDirectory: false,
                extension: 'note'
            };

            const mockEvent = {
                ctrlKey: false,
                metaKey: false,
                shiftKey: false,
                stopPropagation: jest.fn()
            } as any;

            // Mock the downloadAndOpenFile method
            (provider as any).downloadAndOpenFile = jest.fn();

            // Simulate double-click by setting last click time
            (provider as any).lastClickTime = Date.now() - 200;
            (provider as any).lastClickedPath = 'Supernote Device/test.note';

            (provider as any).handleFileClick(mockFile, mockEvent);

            expect((provider as any).downloadAndOpenFile).toHaveBeenCalledWith(mockFile);
        });
    });

    describe('Context Menu', () => {
        it('should show selection-aware context menu', () => {
            const mockFile: SupernoteFile = {
                name: 'test.note',
                uri: '/test.note',
                isDirectory: false,
                extension: 'note'
            };

            const mockEvent = {
                clientX: 100,
                clientY: 100,
                preventDefault: jest.fn(),
                stopPropagation: jest.fn()
            } as any;

            // Mock DOM elements
            document.body.innerHTML = `
                <div data-file-path="Supernote Device/test.note" class="nav-file-title"></div>
            `;

            // Mock the Menu class
            (mockApp as any).Menu = class {
                addItem = jest.fn();
                showAtPosition = jest.fn();
            };

            (provider as any).showVirtualFileContextMenu(mockEvent, mockFile);

            expect(mockEvent.preventDefault).toHaveBeenCalled();
            expect(mockEvent.stopPropagation).toHaveBeenCalled();
        });
    });

    describe('Connection Status', () => {
        it('should update connection status with selection count', () => {
            const filePath = 'Supernote Device/test.note';

            // Add a selection
            (provider as any).selectedFiles.add(filePath);

            // Mock DOM elements
            document.body.innerHTML = `
                <div data-supernote-virtual="true">
                    <div class="tree-item-inner nav-folder-title-content"></div>
                </div>
            `;

            (provider as any).updateConnectionStatus();

            const titleEl = document.querySelector('.tree-item-inner.nav-folder-title-content');
            expect(titleEl?.textContent).toContain('(1 selected)');
        });
    });
}); 