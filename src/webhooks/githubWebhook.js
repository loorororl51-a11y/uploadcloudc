const crypto = require('crypto');
const { getGoogleDriveService } = require('../services/googleDrive');
const { processVideoPipeline } = require('../processors/videoProcessor');

class GitHubWebhookHandler {
    constructor() {
        this.secret = process.env.GITHUB_WEBHOOK_SECRET || 'your-webhook-secret';
    }

    async handleWebhook(req, res, broadcast) {
        try {
            // Verify webhook signature
            if (!this.verifySignature(req)) {
                return res.status(401).json({ error: 'Invalid signature' });
            }

            const event = req.headers['x-github-event'];
            const payload = req.body;

            console.log(`Received GitHub webhook: ${event}`);

            switch (event) {
                case 'push':
                    return await this.handlePushEvent(payload, broadcast);
                case 'workflow_run':
                    return await this.handleWorkflowRunEvent(payload, broadcast);
                case 'repository':
                    return await this.handleRepositoryEvent(payload, broadcast);
                default:
                    console.log(`Unhandled event type: ${event}`);
                    return res.json({ message: 'Event received but not processed' });
            }
        } catch (error) {
            console.error('Error handling GitHub webhook:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    verifySignature(req) {
        const signature = req.headers['x-hub-signature-256'];
        if (!signature) {
            return false;
        }

        const expectedSignature = `sha256=${crypto
            .createHmac('sha256', this.secret)
            .update(JSON.stringify(req.body))
            .digest('hex')}`;

        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    }

    async handlePushEvent(payload, broadcast) {
        try {
            const { repository, commits } = payload;
            
            if (!commits || commits.length === 0) {
                return { message: 'No commits in push event' };
            }

            // Check if any commits contain video files
            const videoFiles = this.extractVideoFiles(commits);
            
            if (videoFiles.length === 0) {
                return { message: 'No video files found in commits' };
            }

            // Process each video file
            const results = [];
            for (const videoFile of videoFiles) {
                try {
                    // Get file from Google Drive (assuming it was uploaded there)
                    const driveService = getGoogleDriveService();
                    const files = await driveService.listFiles(`name = '${videoFile.name}'`);
                    
                    if (files.length > 0) {
                        const fileId = files[0].id;
                        const result = await processVideoPipeline(fileId, videoFile.name, broadcast);
                        results.push(result);
                    }
                } catch (error) {
                    console.error(`Error processing video file ${videoFile.name}:`, error);
                    results.push({ error: error.message, file: videoFile.name });
                }
            }

            return {
                message: 'Push event processed',
                videoFiles: results
            };
        } catch (error) {
            console.error('Error handling push event:', error);
            throw error;
        }
    }

    async handleWorkflowRunEvent(payload, broadcast) {
        try {
            const { workflow_run, repository } = payload;
            
            if (workflow_run.conclusion === 'success') {
                // Check if this workflow was triggered by a video upload
                const videoFiles = this.extractVideoFilesFromWorkflow(workflow_run);
                
                if (videoFiles.length > 0) {
                    const results = [];
                    for (const videoFile of videoFiles) {
                        try {
                            const driveService = getGoogleDriveService();
                            const files = await driveService.listFiles(`name = '${videoFile.name}'`);
                            
                            if (files.length > 0) {
                                const fileId = files[0].id;
                                const result = await processVideoPipeline(fileId, videoFile.name, broadcast);
                                results.push(result);
                            }
                        } catch (error) {
                            console.error(`Error processing video file ${videoFile.name}:`, error);
                            results.push({ error: error.message, file: videoFile.name });
                        }
                    }

                    return {
                        message: 'Workflow run completed successfully',
                        videoFiles: results
                    };
                }
            }

            return { message: 'Workflow run event processed' };
        } catch (error) {
            console.error('Error handling workflow run event:', error);
            throw error;
        }
    }

    async handleRepositoryEvent(payload, broadcast) {
        try {
            const { action, repository } = payload;
            
            if (action === 'created') {
                // New repository created, set up webhooks
                await this.setupRepositoryWebhooks(repository);
                return { message: 'Repository webhooks configured' };
            }

            return { message: 'Repository event processed' };
        } catch (error) {
            console.error('Error handling repository event:', error);
            throw error;
        }
    }

    extractVideoFiles(commits) {
        const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'];
        const videoFiles = [];

        for (const commit of commits) {
            if (commit.added) {
                for (const file of commit.added) {
                    const extension = file.toLowerCase().substring(file.lastIndexOf('.'));
                    if (videoExtensions.includes(extension)) {
                        videoFiles.push({
                            name: file,
                            commit: commit.id,
                            message: commit.message
                        });
                    }
                }
            }
        }

        return videoFiles;
    }

    extractVideoFilesFromWorkflow(workflowRun) {
        // This would need to be customized based on your workflow structure
        // For now, return empty array
        return [];
    }

    async setupRepositoryWebhooks(repository) {
        try {
            // This would set up webhooks for the new repository
            // Implementation depends on your GitHub API setup
            console.log(`Setting up webhooks for repository: ${repository.full_name}`);
        } catch (error) {
            console.error('Error setting up repository webhooks:', error);
        }
    }

    async triggerVideoProcessing(fileId, fileName, broadcast) {
        try {
            console.log(`Triggering video processing for: ${fileName} (${fileId})`);
            
            const result = await processVideoPipeline(fileId, fileName, broadcast);
            
            return {
                success: true,
                result: result
            };
        } catch (error) {
            console.error('Error triggering video processing:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async handleGoogleDriveWebhook(req, res, broadcast) {
        try {
            const { state, resourceId, resourceUri } = req.body;
            
            if (state === 'changed') {
                // Google Drive file changed, check if it's a video
                const driveService = getGoogleDriveService();
                const fileInfo = await driveService.getFileInfo(resourceId);
                
                if (await driveService.isVideoFile(resourceId)) {
                    console.log(`Video file detected in Google Drive: ${fileInfo.name}`);
                    
                    // Trigger video processing
                    const result = await this.triggerVideoProcessing(
                        resourceId,
                        fileInfo.name,
                        broadcast
                    );
                    
                    return res.json({
                        message: 'Google Drive webhook processed',
                        videoProcessing: result
                    });
                }
            }

            return res.json({ message: 'Google Drive webhook received' });
        } catch (error) {
            console.error('Error handling Google Drive webhook:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }
}

// Singleton instance
let webhookHandler = null;

const setupWebhook = () => {
    if (!webhookHandler) {
        webhookHandler = new GitHubWebhookHandler();
    }
    return webhookHandler;
};

module.exports = {
    setupWebhook,
    GitHubWebhookHandler
}; 