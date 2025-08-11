# Google Cobal Video Processor

A comprehensive video processing workflow that handles large video uploads through Google Drive, processes them with custom presets, and uploads the results to ImageKit with automatic Google Sheets tracking.

## 🎯 Workflow Overview

```
User Upload (1GB) 
    ↓
Google Drive Storage
    ↓
GitHub Action Trigger
    ↓
Video Analysis + apply video-preset.json
    ↓
Compress + Web Optimize  
    ↓
Capture Frame at 2s
    ↓
Check Size (98MB limit)
    ↓
Split if needed (original, part2, part3, etc.)
    ↓
Upload to ImageKit
    ↓
Save URLs to Google Sheets 
```

## ✨ Features

- **Large File Support**: Handles videos up to 1GB
- **Automatic Processing**: Triggered via GitHub Actions
- **Smart Splitting**: Automatically splits videos exceeding 98MB
- **Frame Capture**: Captures thumbnail at 2-second mark
- **Custom Presets**: Configurable video processing settings
- **Cloud Storage**: Google Drive for source, ImageKit for processed files
- **Progress Tracking**: Google Sheets integration for monitoring
- **Error Handling**: Comprehensive error logging and recovery

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd google-cobal-try
npm install
```

### 2. Environment Setup

Copy the example environment file and configure your credentials:

```bash
cp env.example .env
```

Edit `.env` with your actual credentials:

```env
# Google Drive API Configuration
GOOGLE_DRIVE_CLIENT_ID=your_client_id
GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3000/auth/google/callback
GOOGLE_DRIVE_REFRESH_TOKEN=your_refresh_token
GOOGLE_DRIVE_FOLDER_ID=your_folder_id

# Google Sheets API Configuration
GOOGLE_SHEETS_CLIENT_ID=your_sheets_client_id
GOOGLE_SHEETS_CLIENT_SECRET=your_sheets_client_secret
GOOGLE_SHEETS_REDIRECT_URI=http://localhost:3000/auth/sheets/callback
GOOGLE_SHEETS_REFRESH_TOKEN=your_sheets_refresh_token
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id

# ImageKit Configuration
IMAGEKIT_PUBLIC_KEY=your_public_key
IMAGEKIT_PRIVATE_KEY=your_private_key
IMAGEKIT_URL_ENDPOINT=your_url_endpoint

# GitHub Configuration
GITHUB_TOKEN=your_github_token
GITHUB_REPO_OWNER=your_username
GITHUB_REPO_NAME=your_repo_name
```

### 3. Configure Video Preset

Edit `video-preset.json` to customize video processing:

```json
{
  "videoCodec": "h264",
  "audioCodec": "aac",
  "resolution": "1920x1080",
  "bitrate": 974,
  "fps": 29.97,
  "audioChannels": 2,
  "audioSampleRate": 48000
}
```

### 4. Start the Server

```bash
npm start
```

The server will run on `http://localhost:3000`

## 📋 API Endpoints

### Upload Video
```bash
POST /upload
Content-Type: multipart/form-data

# Upload a video file
curl -X POST http://localhost:3000/upload \
  -F "video=@your-video.mp4"
```

### Process Video (GitHub Action)
```bash
POST /process/:fileId
Content-Type: application/json

{
  "fileName": "video.mp4"
}
```

### Check Status
```bash
GET /status/:jobId
```

## 🔧 Scripts

### Process Single Video
```bash
node scripts/process-video.js <fileId> <fileName>
```

### Check and Process New Videos
```bash
# Process once
node scripts/check-and-process.js

# Continuous monitoring (every 5 minutes)
node scripts/check-and-process.js --continuous

# Custom interval (every 10 minutes)
node scripts/check-and-process.js --continuous --interval=10
```

## 🏗️ Architecture

### Services

- **GoogleDriveService**: Handles file upload/download to Google Drive
- **VideoProcessor**: Processes videos with FFmpeg using custom presets
- **ImageKitService**: Uploads processed videos to ImageKit
- **GoogleSheetsService**: Tracks processing results in Google Sheets

### Processing Pipeline

1. **Upload**: Video uploaded to server and then to Google Drive
2. **Trigger**: GitHub Action triggered via repository dispatch
3. **Download**: Video downloaded from Google Drive
4. **Analysis**: Video analyzed for metadata
5. **Processing**: Video compressed and optimized using preset
6. **Frame Capture**: Thumbnail captured at 2-second mark
7. **Size Check**: Check if video exceeds 98MB limit
8. **Splitting**: Split into parts if needed
9. **Upload**: Upload all parts to ImageKit
10. **Tracking**: Save URLs and metadata to Google Sheets

## 📊 Google Sheets Structure

The system automatically creates a sheet with the following columns:

| Column | Description |
|--------|-------------|
| Timestamp | Processing timestamp |
| Original File Name | Original video filename |
| Original File ID | Google Drive file ID |
| Processing Status | COMPLETED/ERROR/PROCESSING |
| Video Parts | Number of video parts created |
| Video URLs | ImageKit URLs (pipe-separated) |
| Thumbnail URL | ImageKit thumbnail URL |
| Total Size (MB) | Total size of processed files |
| Processing Time (s) | Time taken to process |
| Error Message | Error details if failed |

## 🔐 Security

- All credentials stored in environment variables
- GitHub secrets for CI/CD
- No hardcoded API keys
- Secure file handling with cleanup

## 🛠️ Development

### Prerequisites

- Node.js 18+
- FFmpeg (automatically installed via ffmpeg-static)
- Google Drive API access
- Google Sheets API access
- ImageKit account
- GitHub repository with Actions enabled

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test
```

### Environment Variables

All required environment variables are documented in `env.example`. Make sure to:

1. Set up Google Cloud Project with Drive and Sheets APIs
2. Create OAuth 2.0 credentials
3. Generate refresh tokens
4. Set up ImageKit account
5. Configure GitHub repository secrets

## 📝 Configuration

### Video Processing Settings

- **Max File Size**: 1GB (configurable via `MAX_FILE_SIZE`)
- **Max Video Size**: 98MB (configurable via `MAX_VIDEO_SIZE_MB`)
- **Frame Capture Time**: 2 seconds (configurable via `FRAME_CAPTURE_TIME`)
- **Preset Path**: `./video-preset.json` (configurable via `VIDEO_PRESET_PATH`)

### Directory Structure

```
├── uploads/          # Temporary upload storage
├── temp/            # Processing temporary files
├── services/        # Service classes
├── scripts/         # Processing scripts
├── .github/         # GitHub Actions workflows
└── video-preset.json # Video processing configuration
```

## 🚨 Troubleshooting

### Common Issues

1. **FFmpeg not found**: The system uses `ffmpeg-static` which should work automatically
2. **Google API errors**: Check your OAuth credentials and refresh tokens
3. **ImageKit upload failures**: Verify your ImageKit credentials
4. **GitHub Action failures**: Check repository secrets and permissions

### Logs

- Server logs: Console output
- Processing logs: Available as GitHub Actions artifacts
- Google Sheets: Processing history and status

## 📈 Monitoring

- **Real-time**: Check Google Sheets for processing status
- **Historical**: All processing results stored in Google Sheets
- **Errors**: Error messages logged in Google Sheets
- **Performance**: Processing time tracked for optimization

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section
2. Review Google Sheets for error details
3. Check GitHub Actions logs
4. Open an issue on GitHub
