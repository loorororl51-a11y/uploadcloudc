const ImageKit = require('imagekit');
const fs = require('fs-extra');
const path = require('path');

class ImageKitService {
    constructor() {
        this.imagekit = null;
        this.publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
        this.privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
        this.urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;
    }

    async initialize() {
        try {
            this.imagekit = new ImageKit({
                publicKey: this.publicKey,
                privateKey: this.privateKey,
                urlEndpoint: this.urlEndpoint
            });

            console.log('ImageKit service initialized successfully');
        } catch (error) {
            console.error('Error initializing ImageKit service:', error);
            throw error;
        }
    }

    async uploadVideo(filePath, fileName, options = {}) {
        try {
            const fileBuffer = await fs.readFile(filePath);
            const fileExtension = path.extname(fileName);
            const baseName = path.basename(fileName, fileExtension);
            const timestamp = Date.now();
            const remoteFileName = `${baseName}_${timestamp}${fileExtension}`;

            const uploadOptions = {
                file: fileBuffer,
                fileName: remoteFileName,
                folder: options.folder || '/videos',
                useUniqueFileName: false,
                tags: options.tags || ['video', 'processed'],
                responseFields: ['url', 'fileId', 'name', 'size']
            };

            const response = await this.imagekit.upload(uploadOptions);

            console.log(`Video uploaded to ImageKit: ${response.name} (${response.url})`);
            return {
                url: response.url,
                fileId: response.fileId,
                name: response.name,
                size: response.size
            };
        } catch (error) {
            console.error('Error uploading video to ImageKit:', error);
            throw error;
        }
    }

    async uploadImage(filePath, fileName, options = {}) {
        try {
            const fileBuffer = await fs.readFile(filePath);
            const fileExtension = path.extname(fileName);
            const baseName = path.basename(fileName, fileExtension);
            const timestamp = Date.now();
            const remoteFileName = `${baseName}_${timestamp}${fileExtension}`;

            const uploadOptions = {
                file: fileBuffer,
                fileName: remoteFileName,
                folder: options.folder || '/thumbnails',
                useUniqueFileName: false,
                tags: options.tags || ['thumbnail', 'frame'],
                responseFields: ['url', 'fileId', 'name', 'size'],
                transformation: options.transformation || [{
                    height: 300,
                    width: 400,
                    crop: 'maintain_ratio'
                }]
            };

            const response = await this.imagekit.upload(uploadOptions);

            console.log(`Image uploaded to ImageKit: ${response.name} (${response.url})`);
            return {
                url: response.url,
                fileId: response.fileId,
                name: response.name,
                size: response.size
            };
        } catch (error) {
            console.error('Error uploading image to ImageKit:', error);
            throw error;
        }
    }

    async uploadMultipleVideos(filePaths, baseFileName, options = {}) {
        try {
            const uploadPromises = filePaths.map((filePath, index) => {
                const extension = path.extname(filePath);
                const partFileName = `${baseFileName}_part${index + 1}${extension}`;
                return this.uploadVideo(filePath, partFileName, options);
            });

            const results = await Promise.all(uploadPromises);
            console.log(`Uploaded ${results.length} video parts to ImageKit`);

            return results;
        } catch (error) {
            console.error('Error uploading multiple videos to ImageKit:', error);
            throw error;
        }
    }

    async deleteFile(fileId) {
        try {
            await this.imagekit.deleteFile(fileId);
            console.log(`File deleted from ImageKit: ${fileId}`);
            return true;
        } catch (error) {
            console.error('Error deleting file from ImageKit:', error);
            throw error;
        }
    }

    async getFileDetails(fileId) {
        try {
            const response = await this.imagekit.getFileDetails(fileId);
            return response;
        } catch (error) {
            console.error('Error getting file details from ImageKit:', error);
            throw error;
        }
    }

    async listFiles(options = {}) {
        try {
            const listOptions = {
                path: options.path || '/',
                limit: options.limit || 100,
                skip: options.skip || 0
            };

            const response = await this.imagekit.listFiles(listOptions);
            return response;
        } catch (error) {
            console.error('Error listing files from ImageKit:', error);
            throw error;
        }
    }

    async getOptimizedUrl(fileId, transformation = []) {
        try {
            const url = this.imagekit.url({
                path: fileId,
                transformation: transformation
            });

            return url;
        } catch (error) {
            console.error('Error generating optimized URL:', error);
            throw error;
        }
    }

    async createFolder(folderName, parentFolderPath = '/') {
        try {
            const response = await this.imagekit.createFolder({
                folderName: folderName,
                parentFolderPath: parentFolderPath
            });

            console.log(`Folder created in ImageKit: ${folderName}`);
            return response;
        } catch (error) {
            console.error('Error creating folder in ImageKit:', error);
            throw error;
        }
    }

    async getVideoThumbnailUrl(videoUrl, time = '00:00:02') {
        try {
            // ImageKit supports video thumbnails via URL parameters
            const thumbnailUrl = `${videoUrl}?tr=w-400,h-300,fo-thumbnail,tt-${time}`;
            return thumbnailUrl;
        } catch (error) {
            console.error('Error generating video thumbnail URL:', error);
            throw error;
        }
    }

    async uploadWithProgress(filePath, fileName, options = {}, progressCallback) {
        try {
            const fileBuffer = await fs.readFile(filePath);
            const fileSize = fileBuffer.length;
            let uploadedBytes = 0;

            // Simulate progress for large files
            const progressInterval = setInterval(() => {
                uploadedBytes += Math.min(fileSize / 10, 1024 * 1024); // 1MB chunks
                if (uploadedBytes >= fileSize) {
                    uploadedBytes = fileSize;
                    clearInterval(progressInterval);
                }
                
                const progress = (uploadedBytes / fileSize) * 100;
                if (progressCallback) {
                    progressCallback(progress);
                }
            }, 100);

            const result = await this.uploadVideo(filePath, fileName, options);
            
            clearInterval(progressInterval);
            if (progressCallback) {
                progressCallback(100);
            }

            return result;
        } catch (error) {
            console.error('Error uploading with progress:', error);
            throw error;
        }
    }

    async batchUpload(files, options = {}) {
        try {
            const results = [];
            const totalFiles = files.length;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                console.log(`Uploading file ${i + 1}/${totalFiles}: ${file.name}`);

                try {
                    let result;
                    if (file.type.startsWith('video/')) {
                        result = await this.uploadVideo(file.path, file.name, options);
                    } else if (file.type.startsWith('image/')) {
                        result = await this.uploadImage(file.path, file.name, options);
                    } else {
                        console.warn(`Skipping unsupported file type: ${file.type}`);
                        continue;
                    }

                    results.push({
                        ...result,
                        originalName: file.name,
                        index: i
                    });
                } catch (error) {
                    console.error(`Error uploading file ${file.name}:`, error);
                    results.push({
                        error: error.message,
                        originalName: file.name,
                        index: i
                    });
                }
            }

            console.log(`Batch upload completed: ${results.length}/${totalFiles} files processed`);
            return results;
        } catch (error) {
            console.error('Error in batch upload:', error);
            throw error;
        }
    }
}

// Singleton instance
let imageKitService = null;

const setupImageKit = async () => {
    if (!imageKitService) {
        imageKitService = new ImageKitService();
        await imageKitService.initialize();
    }
    return imageKitService;
};

const getImageKitService = () => {
    if (!imageKitService) {
        throw new Error('ImageKit service not initialized. Call setupImageKit() first.');
    }
    return imageKitService;
};

module.exports = {
    setupImageKit,
    getImageKitService,
    ImageKitService
}; 