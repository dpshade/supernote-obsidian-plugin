import { installAtPolyfill } from './polyfills';
installAtPolyfill();

import { SupernoteX, toImage } from 'supernote-typescript';

export interface SupernoteWorkerMessage {
    type: 'convert';
    noteBuffer: ArrayBuffer; // Use ArrayBuffer directly for transfer
    pageNumbers: number[];
}

export interface SupernoteWorkerResponse {
    images: string[];
    error?: string;
}

self.onmessage = async (e: MessageEvent<SupernoteWorkerMessage>) => {
    try {
        const { noteBuffer, pageNumbers } = e.data;

        // Create Uint8Array from the transferred ArrayBuffer
        const buffer = new Uint8Array(noteBuffer);
        const sn = new SupernoteX(buffer);

        // Process pages individually to avoid memory issues
        const results: string[] = [];

        for (const pageNum of pageNumbers) {
            try {
                const image = await toImage(sn, [pageNum - 1]); // Convert to 0-based index

                if (image && image.length > 0 && image[0] && typeof image[0].toDataURL === 'function') {
                    results.push(image[0].toDataURL());
                } else {
                    console.warn(`No valid image generated for page ${pageNum}`);
                }
            } catch (pageError) {
                console.error(`Error processing page ${pageNum}:`, pageError);
                // Continue with other pages instead of failing completely
            }
        }

        if (results.length > 0) {
            const response: SupernoteWorkerResponse = {
                images: results
            };
            self.postMessage(response);
        } else {
            throw new Error('No images generated from any pages');
        }
    } catch (error) {
        console.error('Worker error:', error);
        const response: SupernoteWorkerResponse = {
            images: [],
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
        self.postMessage(response);
    }
};
