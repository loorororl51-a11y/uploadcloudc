require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const GoogleDriveService = require('./services/GoogleDriveService');
const VideoProcessor = require('./services/VideoProcessor');
const ImageKitService = require('./services/ImageKitService');
const GoogleSheetsService = require('./services/GoogleSheetsService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '1gb' }));
app.use(express.urlencoded({ extended: true, limit: '1gb' }));

// Serve static files
app.use(express.static('public'));

// Ensure directories exist
fs.ensureDirSync(process.env.UPLOAD_DIR || 'uploads');
fs.ensureDirSync(process.env.TEMP_DIR || 'temp');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || 'uploads');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 1073741824 // 1GB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|avi|mov|mkv|wmv|flv|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only video files are allowed!'));
    }
  }
});

// Initialize services
const googleDriveService = new GoogleDriveService();
const videoProcessor = new VideoProcessor();
const imageKitService = new ImageKitService();
const googleSheetsService = new GoogleSheetsService();

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Google Cobal Video Processor API',
    version: '1.0.0',
    endpoints: {
      upload: 'POST /upload',
      process: 'POST /process/:fileId',
      status: 'GET /status/:jobId'
    }
  });
});

// Upload endpoint
app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const fileSize = req.file.size;

    console.log(`File uploaded: ${fileName} (${fileSize} bytes)`);

    // Upload to Google Drive
    const driveFile = await googleDriveService.uploadFile(filePath, fileName);
    
    // Trigger GitHub Action for processing
    await triggerGitHubAction(driveFile.id, fileName);

    res.json({
      success: true,
      message: 'Video uploaded successfully',
      fileId: driveFile.id,
      fileName: fileName,
      fileSize: fileSize,
      driveUrl: driveFile.webViewLink
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process video endpoint (called by GitHub Action)
app.post('/process/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { fileName } = req.body;

    console.log(`Processing video: ${fileId} - ${fileName}`);

    // Download from Google Drive
    const localPath = await googleDriveService.downloadFile(fileId, fileName);
    
    // Process video with preset
    const processedVideos = await videoProcessor.processVideo(localPath, fileName);
    
    // Upload to ImageKit
    const imageKitUrls = [];
    for (const video of processedVideos) {
      const url = await imageKitService.uploadVideo(video.path, video.name);
      imageKitUrls.push({
        name: video.name,
        url: url,
        size: video.size
      });
    }

    // Save URLs to Google Sheets
    await googleSheetsService.addVideoEntry({
      fileName: fileName,
      originalFileId: fileId,
      processedVideos: imageKitUrls,
      timestamp: new Date().toISOString()
    });

    // Cleanup temp files
    await fs.remove(localPath);
    for (const video of processedVideos) {
      await fs.remove(video.path);
    }

    res.json({
      success: true,
      message: 'Video processed successfully',
      urls: imageKitUrls
    });

  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Status endpoint
app.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    // This would typically check a database or queue for job status
    res.json({
      jobId: jobId,
      status: 'completed', // This would be dynamic
      message: 'Job completed successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ error: error.message });
});

// Helper function to trigger GitHub Action
async function triggerGitHubAction(fileId, fileName) {
  try {
    const axios = require('axios');
    
    const response = await axios.post(
      `https://api.github.com/repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/dispatches`,
      {
        event_type: 'video_processing',
        client_payload: {
          file_id: fileId,
          file_name: fileName
        }
      },
      {
        headers: {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    console.log('GitHub Action triggered:', response.status);
    return response.data;
  } catch (error) {
    console.error('Failed to trigger GitHub Action:', error);
    throw error;
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Upload directory: ${process.env.UPLOAD_DIR || 'uploads'}`);
  console.log(`Temp directory: ${process.env.TEMP_DIR || 'temp'}`);
  console.log(`Max file size: ${process.env.MAX_FILE_SIZE || '1GB'}`);
});

module.exports = app;
