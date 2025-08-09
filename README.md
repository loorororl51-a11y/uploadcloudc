# Video Processing Pipeline

A fully automated video processing pipeline that handles large video files (up to 1GB) with intelligent compression, splitting, and optimization. The system integrates Google Drive, GitHub Actions, ImageKit, and Google Sheets for a complete end-to-end solution.

## 🚀 Features

- **Automated Processing**: Upload videos to Google Drive and trigger automatic processing
- **Smart Compression**: Optimize videos using FFmpeg with configurable presets
- **Intelligent Splitting**: Automatically split videos larger than 98MB into parts
- **Frame Capture**: Extract thumbnail frames at 2 seconds
- **Cloud Storage**: Upload processed videos to ImageKit for web delivery
- **Real-time Monitoring**: WebSocket-based dashboard for live progress tracking
- **Data Tracking**: Store all processing data in Google Sheets
- **GitHub Integration**: Automated workflows triggered by file uploads

## 📋 Prerequisites

- Node.js 18+ 
- FFmpeg (automatically installed via ffmpeg-static)
- Google Cloud Platform account
- ImageKit account
- GitHub account

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd video-processing-pipeline
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```

4. **Configure your `.env` file** (see Configuration section below)

5. **Start the server**
   ```bash
   npm start
   ```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Google Drive API Configuration
GOOGLE_DRIVE_CLIENT_ID=your_google_drive_client_id
GOOGLE_DRIVE_CLIENT_SECRET=your_google_drive_client_secret
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3000/auth/callback
GOOGLE_DRIVE_REFRESH_TOKEN=your_google_drive_refresh_token
GOOGLE_DRIVE_FOLDER_ID=your_google_drive_folder_id

# Google Sheets API Configuration
GOOGLE_SHEETS_CLIENT_ID=your_google_sheets_client_id
GOOGLE_SHEETS_CLIENT_SECRET=your_google_sheets_client_secret
GOOGLE_SHEETS_SPREADSHEET_ID=your_google_sheets_spreadsheet_id

# ImageKit Configuration
IMAGEKIT_PUBLIC_KEY=your_imagekit_public_key
IMAGEKIT_PRIVATE_KEY=your_imagekit_private_key
IMAGEKIT_URL_ENDPOINT=your_imagekit_url_endpoint

# GitHub Configuration
GITHUB_TOKEN=your_github_token
GITHUB_REPOSITORY=your_username/your_repo_name

# Video Processing Configuration
MAX_VIDEO_SIZE_MB=98
FRAME_CAPTURE_TIME=2
TEMP_DIR=./temp
OUTPUT_DIR=./output

# Server Configuration
PORT=3000
NODE_ENV=development
```

### Google Drive Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google Drive API
4. Create OAuth 2.0 credentials
5. Download the credentials and add to your `.env` file
6. Get a refresh token using the OAuth flow

### Google Sheets Setup

1. Enable Google Sheets API in Google Cloud Console
2. Create a new Google Sheet
3. Share it with your service account
4. Add the spreadsheet ID to your `.env` file

### ImageKit Setup

1. Sign up at [ImageKit](https://imagekit.io/)
2. Get your public key, private key, and URL endpoint
3. Add them to your `.env` file

### GitHub Actions Setup

1. Add the following secrets to your GitHub repository:
   - `GOOGLE_DRIVE_CLIENT_ID`
   - `GOOGLE_DRIVE_CLIENT_SECRET`
   - `GOOGLE_DRIVE_REFRESH_TOKEN`
   - `GOOGLE_DRIVE_FOLDER_ID`
   - `GOOGLE_SHEETS_CLIENT_ID`
   - `GOOGLE_SHEETS_CLIENT_SECRET`
   - `GOOGLE_SHEETS_SPREADSHEET_ID`
   - `IMAGEKIT_PUBLIC_KEY`
   - `IMAGEKIT_PRIVATE_KEY`
   - `IMAGEKIT_URL_ENDPOINT`
   - `GITHUB_TOKEN`
   - `WEBHOOK_URL`

## 🔄 How It Works

### 1. User Upload (1GB)
- User uploads video file to Google Drive
- File is stored in the configured folder

### 2. Google Drive Storage
- Video is stored securely in Google Drive
- File metadata is captured

### 3. GitHub Action Trigger
- GitHub Actions workflow is triggered automatically
- Can be triggered by:
  - File upload to specific folders
  - Manual workflow dispatch
  - Repository dispatch events

### 4. Video Analysis + video-preset.json
- System analyzes video properties (duration, codec, resolution)
- Applies settings from `video-preset.json`

### 5. Compress + Web Optimize
- Compresses video using FFmpeg with H.264 codec
- Optimizes for web delivery with fast start flags

### 6. Capture Frame at 2s
- Extracts thumbnail frame at 2 seconds
- Saves as JPEG for preview

### 7. Check Size (98MB limit)
- Checks if compressed video exceeds 98MB
- Determines if splitting is needed

### 8. Split if needed (original, part2, part3, etc.)
- If video is too large, splits into multiple parts
- Each part is optimized for web delivery

### 9. Upload to ImageKit
- Uploads all video parts to ImageKit
- Uploads thumbnail image
- Gets optimized URLs for web delivery

### 10. Save URLs to Google Sheets
- Records all processing data in Google Sheets
- Includes original size, processed size, URLs, processing time

### 11. WebSocket Updates
- Real-time progress updates via WebSocket
- Live dashboard shows processing status

## 📊 Dashboard

Access the monitoring dashboard at `http://localhost:3000` to see:

- Real-time processing statistics
- Current processing queue
- Recent activity
- Connection status

## 🔧 API Endpoints

### POST /process-video
Manually trigger video processing

```json
{
  "fileId": "google_drive_file_id",
  "fileName": "video.mp4"
}
```

### GET /status
Get system status

### POST /webhook/github
GitHub webhook endpoint

### GET /api/stats
Get processing statistics

## 📁 Project Structure

```
video-processing-pipeline/
├── src/
│   ├── services/
│   │   ├── googleDrive.js      # Google Drive integration
│   │   ├── googleSheets.js     # Google Sheets integration
│   │   └── imageKit.js         # ImageKit integration
│   ├── processors/
│   │   └── videoProcessor.js   # Main video processing logic
│   ├── webhooks/
│   │   └── githubWebhook.js    # GitHub webhook handler
│   └── index.js                # Main server file
├── public/
│   └── index.html              # Dashboard interface
├── .github/
│   └── workflows/
│       └── video-processing.yml # GitHub Actions workflow
├── video-preset.json           # Video processing presets
├── package.json
├── env.example
└── README.md
```

## 🎯 Usage Examples

### Manual Processing
```bash
curl -X POST http://localhost:3000/process-video \
  -H "Content-Type: application/json" \
  -d '{"fileId": "your_file_id", "fileName": "video.mp4"}'
```

### GitHub Actions Trigger
```bash
gh workflow run video-processing.yml \
  -f file_id=your_file_id \
  -f file_name=video.mp4
```

### Monitor Processing
```bash
# Watch logs
npm run dev

# Check status
curl http://localhost:3000/status
```

## 🔍 Troubleshooting

### Common Issues

1. **FFmpeg not found**
   - The system uses `ffmpeg-static` which should install automatically
   - If issues persist, install FFmpeg manually

2. **Google Drive authentication errors**
   - Check your OAuth credentials
   - Ensure refresh token is valid
   - Verify folder permissions

3. **ImageKit upload failures**
   - Verify API keys are correct
   - Check network connectivity
   - Ensure file size limits

4. **WebSocket connection issues**
   - Check if server is running
   - Verify port configuration
   - Check firewall settings

### Logs

Check the console output for detailed error messages. The system provides comprehensive logging for debugging.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the troubleshooting section
- Review the configuration examples

## 🔮 Future Enhancements

- [ ] Support for more video formats
- [ ] Advanced video editing features
- [ ] Batch processing capabilities
- [ ] Custom video presets
- [ ] Analytics dashboard
- [ ] Email notifications
- [ ] Mobile app integration 