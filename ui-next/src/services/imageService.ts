/**
 * Image Service
 * Handles image upload and management
 */

export interface UploadImageResponse {
    path: string;
    caption: string | null;
}

export class ImageService {
    private baseUrl: string;

    constructor(baseUrl: string = '') {
        this.baseUrl = baseUrl;
    }

    /**
     * Upload an image file to the server
     */
    async uploadImage(file: File, chapterId: string): Promise<UploadImageResponse> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${this.baseUrl}/api/v1/project/chapters/${chapterId}/images`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to upload image: ${error}`);
        }

        return response.json();
    }

    /**
     * Get the public URL for an image
     */
    getImageUrl(path: string): string {
        // Remove leading 'assets/' if present to match the mounted static path
        const cleanPath = path.startsWith('assets/') ? path.substring(7) : path;
        return `/assets/${cleanPath}`;
    }
}

// Singleton instance
export const imageService = new ImageService();
