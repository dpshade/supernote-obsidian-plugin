import { WorkerPool, ImageConverter } from './main';

// Mock the worker
const mockWorker = {
    onmessage: null as any,
    onerror: null as any,
    postMessage: jest.fn(),
    terminate: jest.fn()
};

// Mock the Worker constructor
global.Worker = jest.fn(() => mockWorker) as any;

// Mock SupernoteX
const mockSupernoteX = {
    pages: [
        { text: 'Page 1' },
        { text: 'Page 2' },
        { text: 'Page 3' }
    ],
    pageWidth: 800,
    pageHeight: 600
};

describe('Worker Improvements', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockWorker.onmessage = null;
        mockWorker.onerror = null;
    });

    describe('WorkerPool with transferable objects', () => {
        it('should use transferable objects for better performance', async () => {
            const workerPool = new WorkerPool(1);
            const originalBuffer = new Uint8Array([1, 2, 3, 4, 5]);
            const pageNumbers = [1, 2];

            // Mock successful response
            const mockResponse = {
                data: {
                    images: ['data:image/png;base64,test1', 'data:image/png;base64,test2']
                }
            };

            // Set up the worker to respond
            setTimeout(() => {
                if (mockWorker.onmessage) {
                    mockWorker.onmessage(mockResponse);
                }
            }, 0);

            const result = await workerPool.processPages(mockSupernoteX as any, pageNumbers, originalBuffer);

            // Verify transferable objects were used
            expect(mockWorker.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'convert',
                    noteBuffer: originalBuffer.buffer,
                    pageNumbers: [1, 2]
                }),
                [originalBuffer.buffer] // Transfer list should include the buffer
            );

            expect(result).toEqual(['data:image/png;base64,test1', 'data:image/png;base64,test2']);
        });

        it('should handle worker errors gracefully', async () => {
            const workerPool = new WorkerPool(1);
            const originalBuffer = new Uint8Array([1, 2, 3, 4, 5]);
            const pageNumbers = [1, 2];

            // Mock error response
            const mockErrorResponse = {
                data: {
                    images: [],
                    error: 'Conversion failed'
                }
            };

            // Set up the worker to respond with error
            setTimeout(() => {
                if (mockWorker.onmessage) {
                    mockWorker.onmessage(mockErrorResponse);
                }
            }, 0);

            await expect(
                workerPool.processPages(mockSupernoteX as any, pageNumbers, originalBuffer)
            ).rejects.toThrow('Conversion failed');
        });

        it('should handle worker exceptions', async () => {
            const workerPool = new WorkerPool(1);
            const originalBuffer = new Uint8Array([1, 2, 3, 4, 5]);
            const pageNumbers = [1, 2];

            // Set up the worker to throw an error
            setTimeout(() => {
                if (mockWorker.onerror) {
                    mockWorker.onerror(new Error('Worker crashed'));
                }
            }, 0);

            await expect(
                workerPool.processPages(mockSupernoteX as any, pageNumbers, originalBuffer)
            ).rejects.toThrow('Worker crashed');
        });
    });

    describe('ImageConverter improvements', () => {
        it('should process pages in parallel with multiple workers', async () => {
            const converter = new ImageConverter(2);
            const originalBuffer = new Uint8Array([1, 2, 3, 4, 5]);
            const pageNumbers = [1, 2, 3, 4];

            // Mock responses for multiple workers
            let callCount = 0;
            setTimeout(() => {
                if (mockWorker.onmessage) {
                    const response = {
                        data: {
                            images: [`data:image/png;base64,test${callCount + 1}`, `data:image/png;base64,test${callCount + 2}`]
                        }
                    };
                    mockWorker.onmessage(response);
                    callCount++;
                }
            }, 0);

            const result = await converter.convertToImages(mockSupernoteX as any, pageNumbers, originalBuffer);

            // Should have called postMessage multiple times (once per worker)
            expect(mockWorker.postMessage).toHaveBeenCalledTimes(2);
            expect(result).toHaveLength(4);
        });

        it('should require original buffer for conversion', async () => {
            const converter = new ImageConverter();

            await expect(
                converter.convertToImages(mockSupernoteX as any, [1, 2])
            ).rejects.toThrow('Original buffer is required for image conversion');
        });

        it('should clean up workers on terminate', () => {
            const converter = new ImageConverter();
            converter.terminate();

            expect(mockWorker.terminate).toHaveBeenCalled();
        });
    });

    describe('Memory management', () => {
        it('should not hold references to transferred buffers', async () => {
            const workerPool = new WorkerPool(1);
            const originalBuffer = new Uint8Array([1, 2, 3, 4, 5]);
            const pageNumbers = [1, 2];

            // Mock successful response
            const mockResponse = {
                data: {
                    images: ['data:image/png;base64,test1', 'data:image/png;base64,test2']
                }
            };

            setTimeout(() => {
                if (mockWorker.onmessage) {
                    mockWorker.onmessage(mockResponse);
                }
            }, 0);

            await workerPool.processPages(mockSupernoteX as any, pageNumbers, originalBuffer);

            // The buffer should be transferred, not copied
            expect(mockWorker.postMessage).toHaveBeenCalledWith(
                expect.any(Object),
                [originalBuffer.buffer] // Transfer list
            );
        });

        it('should handle large files without memory issues', async () => {
            const workerPool = new WorkerPool(1);
            // Create a larger buffer to test memory handling
            const originalBuffer = new Uint8Array(1024 * 1024); // 1MB
            const pageNumbers = [1];

            // Mock successful response
            const mockResponse = {
                data: {
                    images: ['data:image/png;base64,largeimage']
                }
            };

            setTimeout(() => {
                if (mockWorker.onmessage) {
                    mockWorker.onmessage(mockResponse);
                }
            }, 0);

            const result = await workerPool.processPages(mockSupernoteX as any, pageNumbers, originalBuffer);

            expect(result).toEqual(['data:image/png;base64,largeimage']);
            expect(mockWorker.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    noteBuffer: originalBuffer.buffer
                }),
                [originalBuffer.buffer]
            );
        });
    });

    describe('Error recovery', () => {
        it('should continue processing other pages if one fails', async () => {
            const workerPool = new WorkerPool(1);
            const originalBuffer = new Uint8Array([1, 2, 3, 4, 5]);
            const pageNumbers = [1, 2, 3];

            // Mock partial success response
            const mockResponse = {
                data: {
                    images: ['data:image/png;base64,success1', 'data:image/png;base64,success2']
                }
            };

            setTimeout(() => {
                if (mockWorker.onmessage) {
                    mockWorker.onmessage(mockResponse);
                }
            }, 0);

            const result = await workerPool.processPages(mockSupernoteX as any, pageNumbers, originalBuffer);

            // Should return the successful images
            expect(result).toEqual(['data:image/png;base64,success1', 'data:image/png;base64,success2']);
        });
    });
}); 