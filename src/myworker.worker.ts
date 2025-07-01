import { installAtPolyfill } from './polyfills';
installAtPolyfill();

import { SupernoteX, toImage } from 'supernote-typescript';

export interface SupernoteWorkerMessage {
    type: 'convert';
    note: {
        buffer: number[]; // Uint8Array converted to regular array for transfer
        pageWidth: number;
        pageHeight: number;
    };
    pageNumbers: number[];
}

export interface SupernoteWorkerResponse {
    images: string[];
    error?: string;
}

self.onmessage = async (e: MessageEvent<SupernoteWorkerMessage>) => {
    try {
        const { note, pageNumbers } = e.data;

        // Reconstruct the SupernoteX object from the buffer
        const buffer = new Uint8Array(note.buffer);
        const sn = new SupernoteX(buffer);

        // Convert pages to images using the toImage function
        const imageResults = await toImage(sn, pageNumbers);

        // Convert Image objects to data URLs
        const dataUrls = imageResults.map((image) => {
            if (image && typeof image.toDataURL === 'function') {
                return image.toDataURL();
            } else {
                console.error('Invalid image result:', image);
                return null;
            }
        }).filter(Boolean) as string[];

        if (dataUrls.length > 0) {
            const response: SupernoteWorkerResponse = {
                images: dataUrls
            };
            self.postMessage(response);
        } else {
            throw new Error('No images generated');
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
