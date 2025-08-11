require('dotenv').config();
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const GoogleDriveService = require('../services/GoogleDriveService');
const GoogleSheetsService = require('../services/GoogleSheetsService');
const VideoProcessingScript = require('./process-video');

class CheckAndProcessScript {
  constructor() {
    this.googleDriveService = new GoogleDriveService();
    this.googleSheetsService = new GoogleSheetsService();
    this.videoProcessor = new VideoProcessingScript();
    this.processedFileIds = new Set();
  }

  async loadProcessedFileIds() {
    try {
      const entries = await this.googleSheetsService.getVideoEntries(1000);
      entries.forEach(entry => {
        if (entry.originalFileId) {
          this.processedFileIds.add(entry.originalFileId);
        }
      });
      console.log(`Loaded ${this.processedFileIds.size} processed file IDs`);
    } catch (error) {
      console.warn('Failed to load processed file IDs:', error.message);
    }
  }

  async checkForNewVideos() {
    try {
      console.log('Checking for new videos in Google Drive...');
      
      const files = await this.googleDriveService.listFiles();
      const videoFiles = files.filter(file => this.isVideoFile(file.name));
      
      console.log(`Found ${videoFiles.length} video files in Google Drive`);
      
      const newVideos = videoFiles.filter(file => !this.processedFileIds.has(file.id));
      
      console.log(`Found ${newVideos.length} new videos to process`);
      
      return newVideos;
    } catch (error) {
      console.error('Failed to check for new videos:', error);
      throw error;
    }
  }

  isVideoFile(fileName) {
    const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm'];
    const extension = path.extname(fileName).toLowerCase();
    return videoExtensions.includes(extension);
  }

  async processNewVideos(videos) {
    const results = [];
    
    for (const video of videos) {
      try {
        console.log(`\n--- Processing: ${video.name} (${video.id}) ---`);
        
        const result = await this.videoProcessor.processVideo(video.id, video.name);
        results.push({
          fileId: video.id,
          fileName: video.name,
          success: true,
          result: result
        });
        
        // Add to processed set
        this.processedFileIds.add(video.id);
        
        console.log(`✓ Successfully processed: ${video.name}`);
        
        // Add delay between processing to avoid rate limits
        await this.delay(2000);
        
      } catch (error) {
        console.error(`✗ Failed to process ${video.name}:`, error.message);
        results.push({
          fileId: video.id,
          fileName: video.name,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async run() {
    try {
      console.log('Starting video check and process script...');
      
      // Load already processed file IDs
      await this.loadProcessedFileIds();
      
      // Check for new videos
      const newVideos = await this.checkForNewVideos();
      
      if (newVideos.length === 0) {
        console.log('No new videos to process');
        return;
      }
      
      // Process new videos
      const results = await this.processNewVideos(newVideos);
      
      // Summary
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      console.log('\n=== Processing Summary ===');
      console.log(`Total videos: ${results.length}`);
      console.log(`Successful: ${successful}`);
      console.log(`Failed: ${failed}`);
      
      if (failed > 0) {
        console.log('\nFailed videos:');
        results.filter(r => !r.success).forEach(r => {
          console.log(`- ${r.fileName}: ${r.error}`);
        });
      }
      
      console.log('\nScript completed');
      
    } catch (error) {
      console.error('Script execution failed:', error);
      process.exit(1);
    }
  }

  async runContinuous(intervalMinutes = 5) {
    console.log(`Starting continuous monitoring (checking every ${intervalMinutes} minutes)...`);
    
    while (true) {
      try {
        await this.run();
        console.log(`Waiting ${intervalMinutes} minutes before next check...`);
        await this.delay(intervalMinutes * 60 * 1000);
      } catch (error) {
        console.error('Error in continuous run:', error);
        console.log('Waiting 1 minute before retry...');
        await this.delay(60 * 1000);
      }
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  const script = new CheckAndProcessScript();
  
  const args = process.argv.slice(2);
  const continuous = args.includes('--continuous') || args.includes('-c');
  const interval = args.find(arg => arg.startsWith('--interval='))?.split('=')[1] || 5;
  
  if (continuous) {
    script.runContinuous(parseInt(interval));
  } else {
    script.run();
  }
}

module.exports = CheckAndProcessScript;
