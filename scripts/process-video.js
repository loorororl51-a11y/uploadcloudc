require('dotenv').config();
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const GoogleDriveService = require('../services/GoogleDriveService');
const VideoProcessor = require('../services/VideoProcessor');
const ImageKitService = require('../services/ImageKitService');
const GoogleSheetsService = require('../services/GoogleSheetsService');

class VideoProcessingScript {
  constructor() {
    this.googleDriveService = new GoogleDriveService();
    this.videoProcessor = new VideoProcessor();
    this.imageKitService = new ImageKitService();
    this.googleSheetsService = new GoogleSheetsService();
  }

  async processVideo(fileId, fileName) {
    const startTime = Date.now();
    let localPath = null;
    let processedVideos = [];

    try {
      console.log(`Starting video processing for: ${fileName} (ID: ${fileId})`);

      // Step 1: Update status to PROCESSING
      await this.googleSheetsService.updateEntryStatus(fileId, 'PROCESSING');

      // Step 2: Download from Google Drive
      console.log('Downloading video from Google Drive...');
      localPath = await this.googleDriveService.downloadFile(fileId, fileName);
      console.log(`Downloaded to: ${localPath}`);

      // Step 3: Process video with preset
      console.log('Processing video with preset...');
      processedVideos = await this.videoProcessor.processVideo(localPath, fileName);
      console.log(`Processing completed: ${processedVideos.length} files generated`);

      // Step 4: Upload to ImageKit
      console.log('Uploading processed files to ImageKit...');
      const imageKitUrls = [];
      
      for (const video of processedVideos) {
        const url = await this.imageKitService.uploadFile(video.path, video.name, video.type);
        imageKitUrls.push({
          name: video.name,
          url: url,
          size: video.size,
          type: video.type
        });
        console.log(`Uploaded: ${video.name} -> ${url}`);
      }

      // Step 5: Save URLs to Google Sheets
      console.log('Saving results to Google Sheets...');
      const processingTime = (Date.now() - startTime) / 1000;
      
      await this.googleSheetsService.addVideoEntry({
        fileName: fileName,
        originalFileId: fileId,
        processedVideos: imageKitUrls,
        timestamp: new Date().toISOString(),
        processingTime: processingTime
      });

      // Step 6: Update status to COMPLETED
      await this.googleSheetsService.updateEntryStatus(fileId, 'COMPLETED', {
        processingTime: processingTime
      });

      console.log(`Video processing completed successfully in ${processingTime.toFixed(2)}s`);
      return {
        success: true,
        processingTime: processingTime,
        urls: imageKitUrls
      };

    } catch (error) {
      console.error('Video processing failed:', error);
      
      const processingTime = (Date.now() - startTime) / 1000;
      
      // Update status to ERROR
      await this.googleSheetsService.updateEntryStatus(fileId, 'ERROR', {
        processingTime: processingTime,
        errorMessage: error.message
      });

      throw error;
    } finally {
      // Cleanup temp files
      await this.cleanupFiles(localPath, processedVideos);
    }
  }

  async cleanupFiles(localPath, processedVideos) {
    try {
      if (localPath && await fs.pathExists(localPath)) {
        await fs.remove(localPath);
        console.log(`Cleaned up: ${localPath}`);
      }

      for (const video of processedVideos) {
        if (video.path && await fs.pathExists(video.path)) {
          await fs.remove(video.path);
          console.log(`Cleaned up: ${video.path}`);
        }
      }
    } catch (error) {
      console.warn('Cleanup error:', error.message);
    }
  }

  async run() {
    try {
      // Get command line arguments
      const args = process.argv.slice(2);
      
      if (args.length < 2) {
        console.error('Usage: node process-video.js <fileId> <fileName>');
        process.exit(1);
      }

      const fileId = args[0];
      const fileName = args[1];

      console.log(`Processing video: ${fileName} (ID: ${fileId})`);
      
      const result = await this.processVideo(fileId, fileName);
      
      console.log('Processing completed successfully');
      console.log('Results:', JSON.stringify(result, null, 2));
      
      process.exit(0);
    } catch (error) {
      console.error('Script execution failed:', error);
      process.exit(1);
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  const script = new VideoProcessingScript();
  script.run();
}

module.exports = VideoProcessingScript;
