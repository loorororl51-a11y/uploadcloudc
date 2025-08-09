#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function setup() {
    console.log('🎬 Video Processing Pipeline Setup');
    console.log('=====================================\n');

    console.log('This script will help you configure the video processing pipeline.\n');

    // Check if .env already exists
    const envPath = path.join(process.cwd(), '.env');
    if (await fs.pathExists(envPath)) {
        const overwrite = await question('A .env file already exists. Do you want to overwrite it? (y/N): ');
        if (overwrite.toLowerCase() !== 'y') {
            console.log('Setup cancelled.');
            rl.close();
            return;
        }
    }

    console.log('\n📋 Let\'s configure your environment variables:\n');

    // Google Drive Configuration
    console.log('🔗 Google Drive Configuration:');
    console.log('1. Go to https://console.cloud.google.com/');
    console.log('2. Create a new project or select existing one');
    console.log('3. Enable Google Drive API');
    console.log('4. Create OAuth 2.0 credentials\n');

    const googleDriveClientId = await question('Google Drive Client ID: ');
    const googleDriveClientSecret = await question('Google Drive Client Secret: ');
    const googleDriveFolderId = await question('Google Drive Folder ID (where videos will be uploaded): ');

    // Google Sheets Configuration
    console.log('\n📊 Google Sheets Configuration:');
    console.log('1. Enable Google Sheets API in Google Cloud Console');
    console.log('2. Create a new Google Sheet');
    console.log('3. Share it with your service account\n');

    const googleSheetsClientId = await question('Google Sheets Client ID: ');
    const googleSheetsClientSecret = await question('Google Sheets Client Secret: ');
    const googleSheetsSpreadsheetId = await question('Google Sheets Spreadsheet ID: ');

    // ImageKit Configuration
    console.log('\n🖼️ ImageKit Configuration:');
    console.log('1. Sign up at https://imagekit.io/');
    console.log('2. Get your API keys from the dashboard\n');

    const imagekitPublicKey = await question('ImageKit Public Key: ');
    const imagekitPrivateKey = await question('ImageKit Private Key: ');
    const imagekitUrlEndpoint = await question('ImageKit URL Endpoint: ');

    // GitHub Configuration
    console.log('\n🐙 GitHub Configuration:');
    console.log('1. Create a GitHub Personal Access Token');
    console.log('2. Add it to your repository secrets\n');

    const githubToken = await question('GitHub Token: ');
    const githubRepository = await question('GitHub Repository (format: username/repo-name): ');

    // Video Processing Configuration
    console.log('\n🎥 Video Processing Configuration:');
    
    const maxVideoSizeMB = await question('Maximum video size in MB (default: 98): ') || '98';
    const frameCaptureTime = await question('Frame capture time in seconds (default: 2): ') || '2';
    const port = await question('Server port (default: 3000): ') || '3000';

    // Create .env file
    const envContent = `# Google Drive API Configuration
GOOGLE_DRIVE_CLIENT_ID=${googleDriveClientId}
GOOGLE_DRIVE_CLIENT_SECRET=${googleDriveClientSecret}
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:${port}/auth/callback
GOOGLE_DRIVE_REFRESH_TOKEN=your_google_drive_refresh_token
GOOGLE_DRIVE_FOLDER_ID=${googleDriveFolderId}

# Google Sheets API Configuration
GOOGLE_SHEETS_CLIENT_ID=${googleSheetsClientId}
GOOGLE_SHEETS_CLIENT_SECRET=${googleSheetsClientSecret}
GOOGLE_SHEETS_SPREADSHEET_ID=${googleSheetsSpreadsheetId}

# ImageKit Configuration
IMAGEKIT_PUBLIC_KEY=${imagekitPublicKey}
IMAGEKIT_PRIVATE_KEY=${imagekitPrivateKey}
IMAGEKIT_URL_ENDPOINT=${imagekitUrlEndpoint}

# GitHub Configuration
GITHUB_TOKEN=${githubToken}
GITHUB_REPOSITORY=${githubRepository}

# WebSocket Configuration
WEBSOCKET_PORT=8080

# Video Processing Configuration
MAX_VIDEO_SIZE_MB=${maxVideoSizeMB}
FRAME_CAPTURE_TIME=${frameCaptureTime}
TEMP_DIR=./temp
OUTPUT_DIR=./output

# Server Configuration
PORT=${port}
NODE_ENV=development
`;

    try {
        await fs.writeFile(envPath, envContent);
        console.log('\n✅ .env file created successfully!');

        // Create directories
        await fs.ensureDir('./temp');
        await fs.ensureDir('./output');
        console.log('✅ Created temp and output directories');

        // Install dependencies
        console.log('\n📦 Installing dependencies...');
        const { execSync } = require('child_process');
        execSync('npm install', { stdio: 'inherit' });
        console.log('✅ Dependencies installed');

        console.log('\n🎉 Setup completed successfully!');
        console.log('\n📝 Next steps:');
        console.log('1. Get your Google Drive refresh token');
        console.log('2. Add the refresh token to your .env file');
        console.log('3. Add all secrets to your GitHub repository');
        console.log('4. Run: npm start');
        console.log('5. Access the dashboard at: http://localhost:' + port);

        console.log('\n🔗 Useful links:');
        console.log('- Google Cloud Console: https://console.cloud.google.com/');
        console.log('- ImageKit Dashboard: https://imagekit.io/dashboard');
        console.log('- GitHub Settings: https://github.com/settings/tokens');

    } catch (error) {
        console.error('❌ Error during setup:', error.message);
    }

    rl.close();
}

// Handle script arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    console.log('Video Processing Pipeline Setup');
    console.log('');
    console.log('Usage: node setup.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --help, -h     Show this help message');
    console.log('  --skip-deps    Skip dependency installation');
    console.log('');
    process.exit(0);
}

setup().catch(console.error); 