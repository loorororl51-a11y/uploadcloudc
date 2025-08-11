const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs-extra');
const path = require('path');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

class VideoProcessor {
  constructor() {
    this.maxVideoSizeMB = parseInt(process.env.MAX_VIDEO_SIZE_MB) || 98;
    this.frameCaptureTime = parseInt(process.env.FRAME_CAPTURE_TIME) || 2;
    this.presetPath = process.env.VIDEO_PRESET_PATH || './video-preset.json';
    this.preset = this.loadPreset();
  }

  loadPreset() {
    try {
      const presetData = fs.readFileSync(this.presetPath, 'utf8');
      return JSON.parse(presetData);
    } catch (error) {
      console.warn('Failed to load video preset, using defaults');
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

  async processVideo(inputPath, originalFileName) {
    try {
      console.log(`Processing video: ${originalFileName}`);
      
      // Step 1: Analyze video
      const videoInfo = await this.analyzeVideo(inputPath);
      console.log('Video analysis completed:', videoInfo);

      // Step 2: Capture frame at specified time
      const thumbnailPath = await this.captureFrame(inputPath, originalFileName);
      console.log('Frame captured:', thumbnailPath);

      // Step 3: Process video with preset
      const processedPath = await this.compressVideo(inputPath, originalFileName);
      console.log('Video compressed:', processedPath);

      // Step 4: Check size and split if needed
      const processedVideos = await this.checkAndSplitVideo(processedPath, originalFileName);
      console.log('Video processing completed:', processedVideos.length, 'parts');

      // Add thumbnail to results
      processedVideos.push({
        path: thumbnailPath,
        name: `${path.parse(originalFileName).name}_thumbnail.jpg`,
        type: 'thumbnail',
        size: await this.getFileSize(thumbnailPath)
      });

      return processedVideos;
    } catch (error) {
      console.error('Video processing error:', error);
      throw new Error(`Failed to process video: ${error.message}`);
    }
  }

  async analyzeVideo(inputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          reject(new Error(`Failed to analyze video: ${err.message}`));
          return;
        }

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');

        resolve({
          duration: metadata.format.duration,
          size: metadata.format.size,
          bitrate: metadata.format.bit_rate,
          videoCodec: videoStream?.codec_name,
          audioCodec: audioStream?.codec_name,
          resolution: `${videoStream?.width}x${videoStream?.height}`,
          fps: eval(videoStream?.r_frame_rate || '0'),
          audioChannels: audioStream?.channels,
          audioSampleRate: audioStream?.sample_rate
        });
      });
    });
  }

  async captureFrame(inputPath, originalFileName) {
    const outputDir = process.env.TEMP_DIR || 'temp';
    const thumbnailName = `${path.parse(originalFileName).name}_thumbnail.jpg`;
    const thumbnailPath = path.join(outputDir, thumbnailName);

    await fs.ensureDir(outputDir);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .screenshots({
          timestamps: [this.frameCaptureTime],
          filename: thumbnailName,
          folder: outputDir,
          size: '1280x720'
        })
        .on('end', () => {
          console.log(`Frame captured at ${this.frameCaptureTime}s`);
          resolve(thumbnailPath);
        })
        .on('error', (err) => {
          reject(new Error(`Failed to capture frame: ${err.message}`));
        });
    });
  }

  async compressVideo(inputPath, originalFileName) {
    const outputDir = process.env.TEMP_DIR || 'temp';
    const outputName = `${path.parse(originalFileName).name}_processed.mp4`;
    const outputPath = path.join(outputDir, outputName);

    await fs.ensureDir(outputDir);

    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .videoCodec(this.preset.videoCodec)
        .audioCodec(this.preset.audioCodec)
        .size(this.preset.resolution)
        .videoBitrate(this.preset.bitrate)
        .fps(this.preset.fps)
        .audioChannels(this.preset.audioChannels)
        .audioFrequency(this.preset.audioSampleRate)
        .outputOptions([
          '-preset', 'medium',
          '-crf', '23',
          '-movflags', '+faststart'
        ])
        .output(outputPath);

      command
        .on('end', () => {
          console.log('Video compression completed');
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(new Error(`Failed to compress video: ${err.message}`));
        })
        .on('progress', (progress) => {
          console.log(`Processing: ${progress.percent}% done`);
        })
        .run();
    });
  }

  async checkAndSplitVideo(videoPath, originalFileName) {
    const fileSize = await this.getFileSize(videoPath);
    const fileSizeMB = fileSize / (1024 * 1024);

    console.log(`Processed video size: ${fileSizeMB.toFixed(2)} MB`);

    if (fileSizeMB <= this.maxVideoSizeMB) {
      // No splitting needed
      return [{
        path: videoPath,
        name: path.basename(videoPath),
        type: 'video',
        size: fileSize
      }];
    }

    // Split video into parts
    console.log(`Video exceeds ${this.maxVideoSizeMB}MB, splitting into parts...`);
    return await this.splitVideo(videoPath, originalFileName);
  }

  async splitVideo(videoPath, originalFileName) {
    const videoInfo = await this.analyzeVideo(videoPath);
    const duration = parseFloat(videoInfo.duration);
    const fileSize = await this.getFileSize(videoPath);
    const fileSizeMB = fileSize / (1024 * 1024);
    
    // Calculate number of parts needed
    const partsNeeded = Math.ceil(fileSizeMB / this.maxVideoSizeMB);
    const durationPerPart = duration / partsNeeded;

    console.log(`Splitting into ${partsNeeded} parts, ${durationPerPart.toFixed(2)}s each`);

    const outputDir = process.env.TEMP_DIR || 'temp';
    const baseName = path.parse(originalFileName).name;
    const parts = [];

    for (let i = 0; i < partsNeeded; i++) {
      const startTime = i * durationPerPart;
      const endTime = (i + 1) * durationPerPart;
      const partName = `${baseName}_part${i + 1}.mp4`;
      const partPath = path.join(outputDir, partName);

      await this.extractVideoSegment(videoPath, partPath, startTime, endTime);
      
      const partSize = await this.getFileSize(partPath);
      parts.push({
        path: partPath,
        name: partName,
        type: 'video',
        size: partSize,
        part: i + 1,
        totalParts: partsNeeded
      });
    }

    // Remove original processed file
    await fs.remove(videoPath);

    return parts;
  }

  async extractVideoSegment(inputPath, outputPath, startTime, endTime) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(endTime - startTime)
        .outputOptions([
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero'
        ])
        .output(outputPath)
        .on('end', () => {
          console.log(`Part extracted: ${path.basename(outputPath)}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(new Error(`Failed to extract video segment: ${err.message}`));
        })
        .run();
    });
  }

  async getFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      throw new Error(`Failed to get file size: ${error.message}`);
    }
  }

  async cleanupFiles(filePaths) {
    for (const filePath of filePaths) {
      try {
        await fs.remove(filePath);
        console.log(`Cleaned up: ${filePath}`);
      } catch (error) {
        console.warn(`Failed to cleanup ${filePath}:`, error.message);
      }
    }
  }
}

module.exports = VideoProcessor;
