const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs-extra');
const path = require('path');
const { getGoogleDriveService } = require('../services/googleDrive');
const { getGoogleSheetsService } = require('../services/googleSheets');
const { getImageKitService } = require('../services/imageKit');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

class VideoProcessor {
    constructor() {
        this.maxVideoSizeMB = parseInt(process.env.MAX_VIDEO_SIZE_MB) || 98;
        this.frameCaptureTime = parseInt(process.env.FRAME_CAPTURE_TIME) || 2;
        this.tempDir = process.env.TEMP_DIR || './temp';
        this.outputDir = process.env.OUTPUT_DIR || './output';
    }

    async processVideoPipeline(fileId, fileName, broadcast) {
        const startTime = Date.now();
        let processingData = {
            fileId,
            fileName,
            status: 'Processing',
            originalSizeMB: 0,
            processedSizeMB: 0,
            videoUrl: '',
            thumbnailUrl: '',
            processingTime: 0,
            errorMessage: '',
            partsCount: 1,
            partUrls: []
        };

        try {
            // Broadcast start
            broadcast({
                type: 'processing_started',
                data: { fileId, fileName, timestamp: new Date().toISOString() }
            });

            // Step 1: Download from Google Drive
            broadcast({
                type: 'status_update',
                data: { fileId, status: 'Downloading from Google Drive...', progress: 10 }
            });

            const driveService = getGoogleDriveService();
            const fileInfo = await driveService.getFileInfo(fileId);
            processingData.originalSizeMB = Math.round(parseInt(fileInfo.size) / (1024 * 1024));

            const downloadPath = path.join(this.tempDir, fileName);
            await driveService.downloadFile(fileId, downloadPath);

            // Step 2: Analyze video
            broadcast({
                type: 'status_update',
                data: { fileId, status: 'Analyzing video...', progress: 20 }
            });

            const videoInfo = await this.analyzeVideo(downloadPath);

            // Step 3: Compress and optimize
            broadcast({
                type: 'status_update',
                data: { fileId, status: 'Compressing video...', progress: 30 }
            });

            const compressedPath = await this.compressVideo(downloadPath, fileName, videoInfo);

            // Step 4: Capture frame at 2 seconds
            broadcast({
                type: 'status_update',
                data: { fileId, status: 'Capturing thumbnail...', progress: 50 }
            });

            const thumbnailPath = await this.captureFrame(compressedPath, fileName);

            // Step 5: Check size and split if needed
            broadcast({
                type: 'status_update',
                data: { fileId, status: 'Checking file size...', progress: 60 }
            });

            const compressedSize = await this.getFileSize(compressedPath);
            const compressedSizeMB = Math.round(compressedSize / (1024 * 1024));
            processingData.processedSizeMB = compressedSizeMB;

            let videoParts = [];
            if (compressedSizeMB > this.maxVideoSizeMB) {
                broadcast({
                    type: 'status_update',
                    data: { fileId, status: 'Splitting video...', progress: 70 }
                });

                videoParts = await this.splitVideo(compressedPath, fileName);
                processingData.partsCount = videoParts.length;
            } else {
                videoParts = [compressedPath];
            }

            // Step 6: Upload to ImageKit
            broadcast({
                type: 'status_update',
                data: { fileId, status: 'Uploading to ImageKit...', progress: 80 }
            });

            try {
                const imageKitService = getImageKitService();
                
                // Upload thumbnail
                const thumbnailResult = await imageKitService.uploadImage(thumbnailPath, `thumb_${fileName}`);
                processingData.thumbnailUrl = thumbnailResult.url;

                // Upload video parts
                const uploadPromises = videoParts.map((partPath, index) => {
                    const partName = videoParts.length > 1 ? `${fileName}_part${index + 1}` : fileName;
                    return imageKitService.uploadVideo(partPath, partName);
                });

                const uploadResults = await Promise.all(uploadPromises);
                processingData.partUrls = uploadResults.map(result => result.url);
                processingData.videoUrl = uploadResults[0].url; // Main video URL
                
                console.log('✅ Videos uploaded to ImageKit successfully');
            } catch (imageKitError) {
                console.log('⚠️ ImageKit upload failed, continuing without upload...');
                processingData.thumbnailUrl = 'ImageKit not available';
                processingData.videoUrl = 'ImageKit not available';
                processingData.partUrls = ['ImageKit not available'];
            }

            // Step 7: Save to Google Sheets
            broadcast({
                type: 'status_update',
                data: { fileId, status: 'Saving to database...', progress: 90 }
            });

            const sheetsService = getGoogleSheetsService();
            processingData.status = 'Completed';
            processingData.processingTime = Math.round((Date.now() - startTime) / 1000);

            await sheetsService.addVideoRecord(processingData);

            // Step 8: Cleanup
            broadcast({
                type: 'status_update',
                data: { fileId, status: 'Cleaning up...', progress: 95 }
            });

            await this.cleanup([downloadPath, compressedPath, thumbnailPath, ...videoParts]);

            // Broadcast completion
            broadcast({
                type: 'processing_completed',
                data: {
                    fileId,
                    fileName,
                    result: processingData,
                    timestamp: new Date().toISOString()
                }
            });

            console.log(`✅ Video processing completed: ${fileName}`);
            return processingData;

        } catch (error) {
            console.error(`❌ Video processing failed: ${fileName}`, error);
            
            processingData.status = 'Failed';
            processingData.errorMessage = error.message;
            processingData.processingTime = Math.round((Date.now() - startTime) / 1000);

            // Save error to sheets
            try {
                const sheetsService = getGoogleSheetsService();
                await sheetsService.addVideoRecord(processingData);
            } catch (sheetsError) {
                console.log('Google Sheets tracking not available, continuing...');
            }

            // Broadcast error
            broadcast({
                type: 'processing_failed',
                data: {
                    fileId,
                    fileName,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }
            });

            throw error;
        }
    }

    async analyzeVideo(filePath) {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) {
                    reject(err);
                    return;
                }

                const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
                const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');

                const info = {
                    duration: metadata.format.duration,
                    size: metadata.format.size,
                    bitrate: metadata.format.bit_rate,
                    videoCodec: videoStream ? videoStream.codec_name : 'unknown',
                    audioCodec: audioStream ? audioStream.codec_name : 'unknown',
                    width: videoStream ? videoStream.width : 0,
                    height: videoStream ? videoStream.height : 0,
                    fps: videoStream ? eval(videoStream.r_frame_rate) : 0
                };

                resolve(info);
            });
        });
    }

    async compressVideo(inputPath, fileName, videoInfo) {
        const outputPath = path.join(this.outputDir, `compressed_${fileName}`);
        
        return new Promise((resolve, reject) => {
            const command = ffmpeg(inputPath)
                .outputOptions([
                    '-c:v libx264',
                    '-c:a aac',
                    '-b:v 1000k',
                    '-b:a 128k',
                    '-preset medium',
                    '-crf 23',
                    '-movflags +faststart',
                    '-y'
                ])
                .output(outputPath)
                .on('end', () => {
                    console.log(`Video compressed: ${outputPath}`);
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    reject(err);
                })
                .run();
        });
    }

    async captureFrame(videoPath, fileName) {
        const outputPath = path.join(this.outputDir, `thumb_${path.parse(fileName).name}.jpg`);
        
        return new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .outputOptions([
                    '-ss 00:00:02',
                    '-vframes 1',
                    '-q:v 2',
                    '-y'
                ])
                .output(outputPath)
                .on('end', () => {
                    console.log(`Frame captured: ${outputPath}`);
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    reject(err);
                })
                .run();
        });
    }

    async splitVideo(videoPath, fileName) {
        const videoInfo = await this.analyzeVideo(videoPath);
        const duration = parseFloat(videoInfo.duration);
        const maxDurationPerPart = Math.floor(duration / Math.ceil(duration / 60)); // Split into ~1 minute parts
        
        const parts = [];
        const baseName = path.parse(fileName).name;
        const extension = path.parse(fileName).ext;

        for (let i = 0; i < Math.ceil(duration / maxDurationPerPart); i++) {
            const startTime = i * maxDurationPerPart;
            const endTime = Math.min((i + 1) * maxDurationPerPart, duration);
            const partPath = path.join(this.outputDir, `${baseName}_part${i + 1}${extension}`);

            await this.extractVideoSegment(videoPath, partPath, startTime, endTime);
            parts.push(partPath);
        }

        console.log(`Video split into ${parts.length} parts`);
        return parts;
    }

    async extractVideoSegment(inputPath, outputPath, startTime, endTime) {
        return new Promise((resolve, reject) => {
            const duration = endTime - startTime;
            
            ffmpeg(inputPath)
                .outputOptions([
                    `-ss ${startTime}`,
                    `-t ${duration}`,
                    '-c copy',
                    '-avoid_negative_ts make_zero',
                    '-y'
                ])
                .output(outputPath)
                .on('end', () => {
                    console.log(`Video segment extracted: ${outputPath}`);
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    reject(err);
                })
                .run();
        });
    }

    async getFileSize(filePath) {
        const stats = await fs.stat(filePath);
        return stats.size;
    }

    async cleanup(filePaths) {
        for (const filePath of filePaths) {
            try {
                if (await fs.pathExists(filePath)) {
                    await fs.remove(filePath);
                    console.log(`Cleaned up: ${filePath}`);
                }
            } catch (error) {
                console.error(`Error cleaning up ${filePath}:`, error);
            }
        }
    }

    async getVideoPreset() {
        try {
            const presetPath = path.join(process.cwd(), 'video-preset.json');
            if (await fs.pathExists(presetPath)) {
                const presetData = await fs.readJson(presetPath);
                return presetData;
            }
        } catch (error) {
            console.error('Error reading video preset:', error);
        }

        // Default preset
        return {
            videoCodec: 'h264',
            audioCodec: 'aac',
            resolution: '1920x1080',
            bitrate: 974,
            fps: 29.97,
            audioChannels: 2,
            audioSampleRate: 48000
        };
    }
}

// Export the main processing function
const processVideoPipeline = async (fileId, fileName, broadcast) => {
    const processor = new VideoProcessor();
    return await processor.processVideoPipeline(fileId, fileName, broadcast);
};

module.exports = {
    processVideoPipeline,
    VideoProcessor
}; 