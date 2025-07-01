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
        if (!noteBuffer || noteBuffer.byteLength < 100) {
            throw new Error('Input buffer is too small or missing.');
        }
        const buffer = new Uint8Array(noteBuffer);
        // Log first 16 bytes for debugging
        console.log('Buffer first 16 bytes:', Array.from(buffer.slice(0, 16)));

        let sn: SupernoteX;
        try {
            sn = new SupernoteX(buffer);
        } catch (parseError) {
            throw new Error('Failed to parse Supernote file: ' + (parseError instanceof Error ? parseError.message : parseError));
        }

        if (!sn.pages || !Array.isArray(sn.pages) || sn.pages.length === 0) {
            throw new Error('SupernoteX parsing failed: no pages found. File may be invalid.');
        }

        // Add detailed logging of SupernoteX structure
        console.log('SupernoteX object:', sn);
        console.log('Pages array length:', sn.pages.length);
        console.log('First page structure:', sn.pages[0]);
        console.log('Available properties on first page:', Object.keys(sn.pages[0] || {}));

        // Check LAYERSEQ specifically
        const firstPage = sn.pages[0];
        if (firstPage) {
            console.log('LAYERSEQ value:', firstPage.LAYERSEQ);
            console.log('LAYERSEQ type:', typeof firstPage.LAYERSEQ);
            console.log('LAYERSEQ is array:', Array.isArray(firstPage.LAYERSEQ));
            if (firstPage.LAYERSEQ) {
                console.log('LAYERSEQ length:', firstPage.LAYERSEQ.length);
                console.log('LAYERSEQ contents:', firstPage.LAYERSEQ);
            }
        }

        const results: string[] = [];
        for (const pageNum of pageNumbers) {
            if (pageNum < 1 || pageNum > sn.pages.length) {
                console.warn(`Skipping invalid page number: ${pageNum}`);
                continue;
            }
            try {
                const page = sn.pages[pageNum - 1];
                console.log(`Processing page ${pageNum}, page object:`, page);
                console.log(`Page ${pageNum} LAYERSEQ:`, page.LAYERSEQ);
                console.log(`Page ${pageNum} LAYERSEQ type:`, typeof page.LAYERSEQ);

                const image = await toImage(sn, [pageNum]); // Use pageNum directly, not pageNum - 1
                if (image && image.length > 0 && image[0] && typeof image[0].toDataURL === 'function') {
                    results.push(image[0].toDataURL());
                } else {
                    console.warn(`No valid image generated for page ${pageNum}`);
                }
            } catch (pageError) {
                console.error(`Error processing page ${pageNum}:`, pageError);
                console.error('Page error details:', {
                    pageIndex: pageNum - 1,
                    pageObject: sn.pages[pageNum - 1],
                    pageKeys: Object.keys(sn.pages[pageNum - 1] || {}),
                    layerSeqValue: sn.pages[pageNum - 1]?.LAYERSEQ,
                    layerSeqType: typeof sn.pages[pageNum - 1]?.LAYERSEQ
                });
            }
        }

        if (results.length > 0) {
            self.postMessage({ images: results });
        } else {
            throw new Error('No images generated from any pages. File may be invalid or empty.');
        }
    } catch (error) {
        console.error('Worker error:', error);
        self.postMessage({
            images: [],
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
};
