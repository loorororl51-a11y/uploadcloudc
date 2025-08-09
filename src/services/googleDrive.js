const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

class GoogleDriveService {
    constructor() {
        this.drive = null;
        this.auth = null;
        this.folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    }

    async initialize() {
        try {
            const oauth2Client = new OAuth2Client(
                process.env.GOOGLE_DRIVE_CLIENT_ID,
                process.env.GOOGLE_DRIVE_CLIENT_SECRET,
                process.env.GOOGLE_DRIVE_REDIRECT_URI
            );

            oauth2Client.setCredentials({
                refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN
            });

            this.auth = oauth2Client;
            this.drive = google.drive({ version: 'v3', auth: oauth2Client });

            console.log('Google Drive service initialized successfully');
        } catch (error) {
            console.error('Error initializing Google Drive service:', error);
            throw error;
        }
    }

    async uploadFile(filePath, fileName, mimeType = 'video/mp4') {
        try {
            const fileMetadata = {
                name: fileName,
                parents: [this.folderId]
            };

            const media = {
                mimeType: mimeType,
                body: fs.createReadStream(filePath)
            };

            const response = await this.drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, name, size, webViewLink'
            });

            console.log(`File uploaded: ${response.data.name} (ID: ${response.data.id})`);
            return response.data;
        } catch (error) {
            console.error('Error uploading file to Google Drive:', error);
            throw error;
        }
    }

    async downloadFile(fileId, outputPath) {
        try {
            const response = await this.drive.files.get({
                fileId: fileId,
                alt: 'media'
            }, { responseType: 'stream' });

            const writer = fs.createWriteStream(outputPath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    console.log(`File downloaded: ${outputPath}`);
                    resolve(outputPath);
                });
                writer.on('error', reject);
            });
        } catch (error) {
            console.error('Error downloading file from Google Drive:', error);
            throw error;
        }
    }

    async getFileInfo(fileId) {
        try {
            const response = await this.drive.files.get({
                fileId: fileId,
                fields: 'id, name, size, mimeType, createdTime, modifiedTime, webViewLink'
            });

            return response.data;
        } catch (error) {
            console.error('Error getting file info:', error);
            throw error;
        }
    }

    async listFiles(query = '') {
        try {
            const response = await this.drive.files.list({
                q: query || `'${this.folderId}' in parents and trashed=false`,
                fields: 'files(id, name, size, mimeType, createdTime, modifiedTime)',
                orderBy: 'createdTime desc'
            });

            return response.data.files;
        } catch (error) {
            console.error('Error listing files:', error);
            throw error;
        }
    }

    async watchFolder(callback) {
        try {
            const response = await this.drive.files.watch({
                resource: {
                    id: this.folderId,
                    type: 'web_hook',
                    address: `${process.env.WEBHOOK_URL}/webhook/drive`,
                    token: 'video-processing-pipeline'
                }
            });

            console.log('Watching Google Drive folder for changes');
            return response.data;
        } catch (error) {
            console.error('Error setting up folder watch:', error);
            throw error;
        }
    }

    async deleteFile(fileId) {
        try {
            await this.drive.files.delete({
                fileId: fileId
            });

            console.log(`File deleted: ${fileId}`);
        } catch (error) {
            console.error('Error deleting file:', error);
            throw error;
        }
    }

    async moveFile(fileId, newFolderId) {
        try {
            const file = await this.drive.files.get({
                fileId: fileId,
                fields: 'parents'
            });

            const previousParents = file.data.parents.join(',');

            const response = await this.drive.files.update({
                fileId: fileId,
                addParents: newFolderId,
                removeParents: previousParents,
                fields: 'id, parents'
            });

            console.log(`File moved: ${fileId} to folder: ${newFolderId}`);
            return response.data;
        } catch (error) {
            console.error('Error moving file:', error);
            throw error;
        }
    }

    async getFileSize(fileId) {
        try {
            const fileInfo = await this.getFileInfo(fileId);
            return parseInt(fileInfo.size) || 0;
        } catch (error) {
            console.error('Error getting file size:', error);
            return 0;
        }
    }

    async isVideoFile(fileId) {
        try {
            const fileInfo = await this.getFileInfo(fileId);
            const videoMimeTypes = [
                'video/mp4',
                'video/avi',
                'video/mov',
                'video/wmv',
                'video/flv',
                'video/webm',
                'video/mkv'
            ];
            return videoMimeTypes.includes(fileInfo.mimeType);
        } catch (error) {
            console.error('Error checking if file is video:', error);
            return false;
        }
    }
}

// Singleton instance
let googleDriveService = null;

const setupGoogleDrive = async () => {
    if (!googleDriveService) {
        googleDriveService = new GoogleDriveService();
        await googleDriveService.initialize();
    }
    return googleDriveService;
};

const getGoogleDriveService = () => {
    if (!googleDriveService) {
        throw new Error('Google Drive service not initialized. Call setupGoogleDrive() first.');
    }
    return googleDriveService;
};

module.exports = {
    setupGoogleDrive,
    getGoogleDriveService,
    GoogleDriveService
}; 