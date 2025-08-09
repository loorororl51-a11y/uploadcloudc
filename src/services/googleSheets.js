const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

class GoogleSheetsService {
    constructor() {
        this.sheets = null;
        this.auth = null;
        this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
        this.sheetName = 'Video Processing Log';
    }

    async initialize() {
        try {
            const oauth2Client = new OAuth2Client(
                process.env.GOOGLE_SHEETS_CLIENT_ID,
                process.env.GOOGLE_SHEETS_CLIENT_SECRET
            );

            oauth2Client.setCredentials({
                refresh_token: process.env.GOOGLE_SHEETS_REFRESH_TOKEN
            });

            this.auth = oauth2Client;
            this.sheets = google.sheets({ version: 'v4', auth: oauth2Client });

            // Initialize sheet headers if they don't exist
            await this.initializeSheetHeaders();

            console.log('Google Sheets service initialized successfully');
        } catch (error) {
            console.error('Error initializing Google Sheets service:', error);
            throw error;
        }
    }

    async initializeSheetHeaders() {
        try {
            const headers = [
                'Timestamp',
                'File ID',
                'File Name',
                'Original Size (MB)',
                'Processed Size (MB)',
                'Video URL',
                'Thumbnail URL',
                'Processing Status',
                'Processing Time (seconds)',
                'Error Message',
                'Parts Count',
                'Part URLs'
            ];

            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A1:L1`,
                valueInputOption: 'RAW',
                resource: {
                    values: [headers]
                }
            });

            console.log('Sheet headers initialized');
        } catch (error) {
            console.error('Error initializing sheet headers:', error);
        }
    }

    async addVideoRecord(data) {
        try {
            const row = [
                new Date().toISOString(),
                data.fileId || '',
                data.fileName || '',
                data.originalSizeMB || '',
                data.processedSizeMB || '',
                data.videoUrl || '',
                data.thumbnailUrl || '',
                data.status || 'Processing',
                data.processingTime || '',
                data.errorMessage || '',
                data.partsCount || 1,
                data.partUrls ? JSON.stringify(data.partUrls) : ''
            ];

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A:L`,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [row]
                }
            });

            console.log(`Video record added to sheet: ${data.fileName}`);
            return true;
        } catch (error) {
            console.error('Error adding video record to sheet:', error);
            throw error;
        }
    }

    async updateVideoRecord(fileId, updates) {
        try {
            // Find the row with the file ID
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A:L`
            });

            const rows = response.data.values || [];
            let rowIndex = -1;

            for (let i = 1; i < rows.length; i++) {
                if (rows[i][1] === fileId) {
                    rowIndex = i + 1; // +1 because sheets are 1-indexed
                    break;
                }
            }

            if (rowIndex === -1) {
                throw new Error(`File ID ${fileId} not found in sheet`);
            }

            // Update specific columns
            const updatesArray = [];
            for (const [key, value] of Object.entries(updates)) {
                const columnIndex = this.getColumnIndex(key);
                if (columnIndex !== -1) {
                    updatesArray.push({
                        range: `${this.sheetName}!${columnIndex}${rowIndex}`,
                        values: [[value]]
                    });
                }
            }

            if (updatesArray.length > 0) {
                await this.sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: {
                        valueInputOption: 'RAW',
                        data: updatesArray
                    }
                });

                console.log(`Video record updated: ${fileId}`);
            }

            return true;
        } catch (error) {
            console.error('Error updating video record:', error);
            throw error;
        }
    }

    getColumnIndex(key) {
        const columnMap = {
            'timestamp': 'A',
            'fileId': 'B',
            'fileName': 'C',
            'originalSizeMB': 'D',
            'processedSizeMB': 'E',
            'videoUrl': 'F',
            'thumbnailUrl': 'G',
            'status': 'H',
            'processingTime': 'I',
            'errorMessage': 'J',
            'partsCount': 'K',
            'partUrls': 'L'
        };

        return columnMap[key] || -1;
    }

    async getVideoRecords(limit = 100) {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A2:L${limit + 1}`
            });

            const rows = response.data.values || [];
            const records = [];

            for (const row of rows) {
                if (row.length >= 12) {
                    records.push({
                        timestamp: row[0],
                        fileId: row[1],
                        fileName: row[2],
                        originalSizeMB: row[3],
                        processedSizeMB: row[4],
                        videoUrl: row[5],
                        thumbnailUrl: row[6],
                        status: row[7],
                        processingTime: row[8],
                        errorMessage: row[9],
                        partsCount: row[10],
                        partUrls: row[11] ? JSON.parse(row[11]) : []
                    });
                }
            }

            return records;
        } catch (error) {
            console.error('Error getting video records:', error);
            throw error;
        }
    }

    async getVideoRecordByFileId(fileId) {
        try {
            const records = await this.getVideoRecords();
            return records.find(record => record.fileId === fileId);
        } catch (error) {
            console.error('Error getting video record by file ID:', error);
            throw error;
        }
    }

    async deleteVideoRecord(fileId) {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A:L`
            });

            const rows = response.data.values || [];
            let rowIndex = -1;

            for (let i = 1; i < rows.length; i++) {
                if (rows[i][1] === fileId) {
                    rowIndex = i + 1;
                    break;
                }
            }

            if (rowIndex !== -1) {
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: {
                        requests: [
                            {
                                deleteDimension: {
                                    range: {
                                        sheetId: 0,
                                        dimension: 'ROWS',
                                        startIndex: rowIndex - 1,
                                        endIndex: rowIndex
                                    }
                                }
                            }
                        ]
                    }
                });

                console.log(`Video record deleted: ${fileId}`);
            }

            return true;
        } catch (error) {
            console.error('Error deleting video record:', error);
            throw error;
        }
    }

    async getProcessingStats() {
        try {
            const records = await this.getVideoRecords();
            
            const stats = {
                total: records.length,
                completed: records.filter(r => r.status === 'Completed').length,
                processing: records.filter(r => r.status === 'Processing').length,
                failed: records.filter(r => r.status === 'Failed').length,
                averageProcessingTime: 0
            };

            const completedRecords = records.filter(r => r.status === 'Completed' && r.processingTime);
            if (completedRecords.length > 0) {
                const totalTime = completedRecords.reduce((sum, r) => sum + parseFloat(r.processingTime), 0);
                stats.averageProcessingTime = totalTime / completedRecords.length;
            }

            return stats;
        } catch (error) {
            console.error('Error getting processing stats:', error);
            throw error;
        }
    }
}

// Singleton instance
let googleSheetsService = null;

const setupGoogleSheets = async () => {
    if (!googleSheetsService) {
        googleSheetsService = new GoogleSheetsService();
        await googleSheetsService.initialize();
    }
    return googleSheetsService;
};

const getGoogleSheetsService = () => {
    if (!googleSheetsService) {
        throw new Error('Google Sheets service not initialized. Call setupGoogleSheets() first.');
    }
    return googleSheetsService;
};

module.exports = {
    setupGoogleSheets,
    getGoogleSheetsService,
    GoogleSheetsService
}; 