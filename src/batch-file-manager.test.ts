import { BatchFileManager, SupernoteFile } from './batch-file-manager';

// Mock test data
const mockFiles: SupernoteFile[] = [
    {
        name: 'test1.note',
        size: 1024,
        date: '2024-01-01',
        uri: '/test1.note',
        extension: 'note',
        isDirectory: false
    },
    {
        name: 'test2.note',
        size: 2048,
        date: '2024-01-02',
        uri: '/test2.note',
        extension: 'note',
        isDirectory: false
    },
    {
        name: 'folder1',
        size: 0,
        date: '2024-01-01',
        uri: '/folder1/',
        extension: '',
        isDirectory: true
    }
];

// Simple test functions
export function testBatchFileManager() {
    console.log('Testing BatchFileManager...');

    // Test file selection
    const manager = new BatchFileManager(null as any, { directConnectIP: '192.168.1.100' });

    // Set up mock files (accessing private property for testing)
    manager['currentFiles'] = mockFiles;

    // Test selection toggle
    manager.toggleFileSelection(mockFiles[0]);
    console.assert(manager.isFileSelected(mockFiles[0]), 'File should be selected');

    manager.toggleFileSelection(mockFiles[0]);
    console.assert(!manager.isFileSelected(mockFiles[0]), 'File should be deselected');

    // Test directory selection (should not be selectable)
    manager.toggleFileSelection(mockFiles[2]);
    console.assert(!manager.isFileSelected(mockFiles[2]), 'Directory should not be selectable');

    // Test select all
    manager.selectAll();
    console.assert(manager.getSelectionCount() === 2, 'Should have 2 files selected');

    // Test clear selection
    manager.clearSelection();
    console.assert(manager.getSelectionCount() === 0, 'Should have 0 files selected');

    // Test size formatting
    console.assert(manager.formatSize(1024) === '1.00 KB', 'Size formatting should work');
    console.assert(manager.formatSize(1048576) === '1.00 MB', 'Size formatting should work');

    console.log('All BatchFileManager tests passed!');
}

// Run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location?.href?.includes('test')) {
    testBatchFileManager();
} 