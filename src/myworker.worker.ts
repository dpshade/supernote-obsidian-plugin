import { Image } from 'image-js';

export interface SupernoteWorkerMessage {
    type: 'convert';
    note: any; // SupernoteX type
    pageNumbers: number[];
}

export interface SupernoteWorkerResponse {
    images: string[];
    error?: string;
}

// Import SupernoteX and toImage from the correct module
import { SupernoteX, toImage } from 'supernote-typescript';

self.onmessage = async (e: MessageEvent<SupernoteWorkerMessage>) => {
    try {
        const { note, pageNumbers } = e.data;
        const sn = note as SupernoteX;

        const results = await Promise.all(
            pageNumbers.map(pageNum => toImage(sn, [pageNum - 1]))
        );

        if (results.length > 0) {
            const dataUrls = results.map((result: any) => {
                const img = new Image(result.width, result.height, result.data, { alpha: 0 });
                return img.toDataURL();
            });

            const response: SupernoteWorkerResponse = {
                images: dataUrls
            };

            self.postMessage(response);
        } else {
            throw new Error('No images generated');
        }
    } catch (error) {
        const response: SupernoteWorkerResponse = {
            images: [],
            error: error.message
        };
        self.postMessage(response);
    }
};
