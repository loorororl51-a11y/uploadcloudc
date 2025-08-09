const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs-extra');
require('dotenv').config();

const { setupGoogleDrive } = require('./services/googleDrive');
const { setupGoogleSheets } = require('./services/googleSheets');
const { setupImageKit } = require('./services/imageKit');
const { processVideoPipeline } = require('./processors/videoProcessor');
const { setupWebhook } = require('./webhooks/githubWebhook');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Ensure directories exist
const tempDir = process.env.TEMP_DIR || './temp';
const outputDir = process.env.OUTPUT_DIR || './output';

fs.ensureDirSync(tempDir);
fs.ensureDirSync(outputDir);

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received WebSocket message:', data);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('WebSocket connection closed');
    });
});

// Broadcast function for WebSocket
const broadcast = (data) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/status', (req, res) => {
    res.json({ status: 'running', timestamp: new Date().toISOString() });
});

// Video processing endpoint
app.post('/process-video', async (req, res) => {
    try {
        const { fileId, fileName } = req.body;
        
        if (!fileId || !fileName) {
            return res.status(400).json({ error: 'fileId and fileName are required' });
        }
        
        // Start processing in background
        processVideoPipeline(fileId, fileName, broadcast)
            .then((result) => {
                console.log('Video processing completed:', result);
            })
            .catch((error) => {
                console.error('Video processing failed:', error);
            });
        
        res.json({ 
            message: 'Video processing started', 
            fileId, 
            fileName,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error starting video processing:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GitHub webhook endpoint
app.post('/webhook/github', async (req, res) => {
    try {
        const result = await setupWebhook.handleWebhook(req, res, broadcast);
        res.json(result);
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// Initialize services
async function initializeServices() {
    try {
        console.log('Initializing services...');
        
        // Initialize Google Drive
        await setupGoogleDrive();
        console.log('✅ Google Drive service initialized');
        
        // Initialize Google Sheets
        await setupGoogleSheets();
        console.log('✅ Google Sheets service initialized');
        
        // Initialize ImageKit
        await setupImageKit();
        console.log('✅ ImageKit service initialized');
        
        console.log('🎉 All services initialized successfully!');
        
    } catch (error) {
        console.error('❌ Error initializing services:', error);
        process.exit(1);
    }
}

// Start server
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WEBSOCKET_PORT || 8080;

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔌 WebSocket server running on port ${WS_PORT}`);
    console.log(`📊 Status endpoint: http://localhost:${PORT}/status`);
    console.log(`🎥 Video processing endpoint: http://localhost:${PORT}/process-video`);
    
    // Initialize services after server starts
    initializeServices();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    wss.close();
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

module.exports = { app, server, wss, broadcast }; 