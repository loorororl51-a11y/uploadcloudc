const { google } = require('googleapis');
const fs = require('fs-extra');
const path = require('path');

class GoogleDriveService {
  constructor() {
    this.drive = google.drive({
      version: 'v3',
      auth: this.getAuthClient()
    });
    this.folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  }

  getAuthClient() {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_DRIVE_CLIENT_ID,
      process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      process.env.GOOGLE_DRIVE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN
    });

    return oauth2Client;
  }

  async uploadFile(filePath, fileName) {
    try {
      console.log(`Uploading ${fileName} to Google Drive...`);
      
      const fileMetadata = {
        name: fileName,
        parents: [this.folderId]
      };

      const media = {
        mimeType: 'video/mp4',
        body: fs.createReadStream(filePath)
      };

      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id,name,webViewLink,size'
      });

      console.log(`File uploaded successfully: ${response.data.name} (ID: ${response.data.id})`);
      return response.data;
    } catch (error) {
      console.error('Google Drive upload error:', error);
      throw new Error(`Failed to upload file to Google Drive: ${error.message}`);
    }
  }

  async downloadFile(fileId, fileName) {
    try {
      console.log(`Downloading ${fileName} from Google Drive...`);
      
      const tempDir = process.env.TEMP_DIR || 'temp';
      const localPath = path.join(tempDir, `${Date.now()}-${fileName}`);
      
      await fs.ensureDir(tempDir);

      const response = await this.drive.files.get({
        fileId: fileId,
        alt: 'media'
      }, { responseType: 'stream' });

      const writeStream = fs.createWriteStream(localPath);
      
      return new Promise((resolve, reject) => {
        response.data
          .on('end', () => {
            console.log(`File downloaded successfully: ${localPath}`);
            resolve(localPath);
          })
          .on('error', (error) => {
            console.error('Download error:', error);
            reject(new Error(`Failed to download file: ${error.message}`));
          })
          .pipe(writeStream);
      });
    } catch (error) {
      console.error('Google Drive download error:', error);
      throw new Error(`Failed to download file from Google Drive: ${error.message}`);
    }
  }

  async listFiles() {
    try {
      const response = await this.drive.files.list({
        q: `'${this.folderId}' in parents`,
        fields: 'files(id,name,size,createdTime,webViewLink)',
        orderBy: 'createdTime desc'
      });

      return response.data.files;
    } catch (error) {
      console.error('Google Drive list error:', error);
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  async deleteFile(fileId) {
    try {
      await this.drive.files.delete({
        fileId: fileId
      });
      console.log(`File deleted successfully: ${fileId}`);
    } catch (error) {
      console.error('Google Drive delete error:', error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }
}

module.exports = GoogleDriveService;
