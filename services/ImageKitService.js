const ImageKit = require('imagekit');
const fs = require('fs-extra');
const path = require('path');

class ImageKitService {
  constructor() {
    this.imagekit = new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
    });
  }

  async uploadVideo(filePath, fileName) {
    try {
      console.log(`Uploading ${fileName} to ImageKit...`);
      
      const fileBuffer = await fs.readFile(filePath);
      const fileExtension = path.extname(fileName).toLowerCase();
      
      // Determine folder based on file type
      const folder = this.getFolderByExtension(fileExtension);
      
      const uploadResponse = await this.imagekit.upload({
        file: fileBuffer,
        fileName: fileName,
        folder: folder,
        useUniqueFileName: true,
        tags: ['video-processing', 'automated'],
        responseFields: ['url', 'fileId', 'name', 'size']
      });

      console.log(`Uploaded to ImageKit: ${uploadResponse.name} (${uploadResponse.url})`);
      return uploadResponse.url;
    } catch (error) {
      console.error('ImageKit upload error:', error);
      throw new Error(`Failed to upload to ImageKit: ${error.message}`);
    }
  }

  async uploadThumbnail(filePath, fileName) {
    try {
      console.log(`Uploading thumbnail ${fileName} to ImageKit...`);
      
      const fileBuffer = await fs.readFile(filePath);
      
      const uploadResponse = await this.imagekit.upload({
        file: fileBuffer,
        fileName: fileName,
        folder: 'thumbnails',
        useUniqueFileName: true,
        tags: ['thumbnail', 'video-processing'],
        responseFields: ['url', 'fileId', 'name', 'size']
      });

      console.log(`Thumbnail uploaded: ${uploadResponse.name} (${uploadResponse.url})`);
      return uploadResponse.url;
    } catch (error) {
      console.error('ImageKit thumbnail upload error:', error);
      throw new Error(`Failed to upload thumbnail to ImageKit: ${error.message}`);
    }
  }

  async uploadFile(filePath, fileName, fileType = 'video') {
    try {
      const fileExtension = path.extname(fileName).toLowerCase();
      
      if (fileType === 'thumbnail' || fileExtension === '.jpg' || fileExtension === '.png') {
        return await this.uploadThumbnail(filePath, fileName);
      } else {
        return await this.uploadVideo(filePath, fileName);
      }
    } catch (error) {
      console.error('ImageKit upload error:', error);
      throw new Error(`Failed to upload file to ImageKit: ${error.message}`);
    }
  }

  getFolderByExtension(extension) {
    const folderMap = {
      '.mp4': 'videos',
      '.avi': 'videos',
      '.mov': 'videos',
      '.mkv': 'videos',
      '.wmv': 'videos',
      '.flv': 'videos',
      '.webm': 'videos',
      '.jpg': 'thumbnails',
      '.jpeg': 'thumbnails',
      '.png': 'thumbnails',
      '.gif': 'thumbnails'
    };

    return folderMap[extension] || 'videos';
  }

  async listFiles(folder = 'videos', limit = 100) {
    try {
      const response = await this.imagekit.listFiles({
        path: folder,
        limit: limit
      });

      return response;
    } catch (error) {
      console.error('ImageKit list files error:', error);
      throw new Error(`Failed to list files from ImageKit: ${error.message}`);
    }
  }

  async deleteFile(fileId) {
    try {
      const response = await this.imagekit.deleteFile(fileId);
      console.log(`File deleted from ImageKit: ${fileId}`);
      return response;
    } catch (error) {
      console.error('ImageKit delete error:', error);
      throw new Error(`Failed to delete file from ImageKit: ${error.message}`);
    }
  }

  async getFileDetails(fileId) {
    try {
      const response = await this.imagekit.getFileDetails(fileId);
      return response;
    } catch (error) {
      console.error('ImageKit get file details error:', error);
      throw new Error(`Failed to get file details from ImageKit: ${error.message}`);
    }
  }

  generateUrl(filePath, options = {}) {
    try {
      const defaultOptions = {
        transformation: [],
        signed: false,
        expireSeconds: 300
      };

      const finalOptions = { ...defaultOptions, ...options };
      
      return this.imagekit.url({
        path: filePath,
        ...finalOptions
      });
    } catch (error) {
      console.error('ImageKit URL generation error:', error);
      throw new Error(`Failed to generate ImageKit URL: ${error.message}`);
    }
  }

  async uploadMultipleFiles(files) {
    try {
      const uploadPromises = files.map(file => 
        this.uploadFile(file.path, file.name, file.type)
      );

      const results = await Promise.all(uploadPromises);
      console.log(`Uploaded ${results.length} files to ImageKit`);
      
      return results;
    } catch (error) {
      console.error('ImageKit multiple upload error:', error);
      throw new Error(`Failed to upload multiple files to ImageKit: ${error.message}`);
    }
  }
}

module.exports = ImageKitService;
