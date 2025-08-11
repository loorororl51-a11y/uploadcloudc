const { google } = require('googleapis');

class GoogleSheetsService {
  constructor() {
    this.sheets = google.sheets({
      version: 'v4',
      auth: this.getAuthClient()
    });
    this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    this.sheetName = 'VideoProcessing';
  }

  getAuthClient() {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_SHEETS_CLIENT_ID,
      process.env.GOOGLE_SHEETS_CLIENT_SECRET,
      process.env.GOOGLE_SHEETS_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_SHEETS_REFRESH_TOKEN
    });

    return oauth2Client;
  }

  async initializeSheet() {
    try {
      // Check if sheet exists, if not create it
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });

      const sheetExists = response.data.sheets.some(
        sheet => sheet.properties.title === this.sheetName
      );

      if (!sheetExists) {
        await this.createSheet();
      }

      // Ensure headers exist
      await this.ensureHeaders();
    } catch (error) {
      console.error('Failed to initialize sheet:', error);
      throw new Error(`Failed to initialize Google Sheet: ${error.message}`);
    }
  }

  async createSheet() {
    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: this.sheetName
                }
              }
            }
          ]
        }
      });

      console.log(`Created sheet: ${this.sheetName}`);
    } catch (error) {
      console.error('Failed to create sheet:', error);
      throw new Error(`Failed to create Google Sheet: ${error.message}`);
    }
  }

  async ensureHeaders() {
    try {
      const headers = [
        'Timestamp',
        'Original File Name',
        'Original File ID',
        'Processing Status',
        'Video Parts',
        'Video URLs',
        'Thumbnail URL',
        'Total Size (MB)',
        'Processing Time (s)',
        'Error Message'
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A1:J1`,
        valueInputOption: 'RAW',
        resource: {
          values: [headers]
        }
      });

      // Format headers
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: await this.getSheetId(),
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: headers.length
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: {
                      red: 0.2,
                      green: 0.6,
                      blue: 0.8
                    },
                    textFormat: {
                      bold: true,
                      foregroundColor: {
                        red: 1,
                        green: 1,
                        blue: 1
                      }
                    }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            }
          ]
        }
      });

      console.log('Headers ensured in Google Sheet');
    } catch (error) {
      console.error('Failed to ensure headers:', error);
      throw new Error(`Failed to set up headers: ${error.message}`);
    }
  }

  async getSheetId() {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });

      const sheet = response.data.sheets.find(
        sheet => sheet.properties.title === this.sheetName
      );

      return sheet.properties.sheetId;
    } catch (error) {
      console.error('Failed to get sheet ID:', error);
      throw new Error(`Failed to get sheet ID: ${error.message}`);
    }
  }

  async addVideoEntry(data) {
    try {
      await this.initializeSheet();

      const {
        fileName,
        originalFileId,
        processedVideos,
        timestamp,
        processingTime,
        errorMessage
      } = data;

      // Separate videos and thumbnails
      const videos = processedVideos.filter(v => v.type === 'video');
      const thumbnails = processedVideos.filter(v => v.type === 'thumbnail');

      // Calculate total size
      const totalSizeMB = processedVideos.reduce((sum, v) => sum + (v.size / (1024 * 1024)), 0);

      // Prepare video URLs
      const videoUrls = videos.map(v => v.url).join(' | ');
      const thumbnailUrl = thumbnails.length > 0 ? thumbnails[0].url : '';

      const rowData = [
        timestamp || new Date().toISOString(),
        fileName,
        originalFileId,
        errorMessage ? 'ERROR' : 'COMPLETED',
        videos.length,
        videoUrls,
        thumbnailUrl,
        totalSizeMB.toFixed(2),
        processingTime ? processingTime.toFixed(2) : '',
        errorMessage || ''
      ];

      // Append row to sheet
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:J`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: [rowData]
        }
      });

      console.log(`Added video entry to Google Sheets: ${fileName}`);
    } catch (error) {
      console.error('Failed to add video entry:', error);
      throw new Error(`Failed to add entry to Google Sheets: ${error.message}`);
    }
  }

  async getVideoEntries(limit = 100) {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A2:J${limit + 1}`,
        valueRenderOption: 'UNFORMATTED_VALUE'
      });

      const rows = response.data.values || [];
      const headers = [
        'timestamp', 'fileName', 'originalFileId', 'status', 
        'videoParts', 'videoUrls', 'thumbnailUrl', 'totalSizeMB', 
        'processingTime', 'errorMessage'
      ];

      return rows.map(row => {
        const entry = {};
        headers.forEach((header, index) => {
          entry[header] = row[index] || '';
        });
        return entry;
      });
    } catch (error) {
      console.error('Failed to get video entries:', error);
      throw new Error(`Failed to get entries from Google Sheets: ${error.message}`);
    }
  }

  async updateEntryStatus(fileId, status, additionalData = {}) {
    try {
      // Find the row with the file ID
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:C`
      });

      const rows = response.data.values || [];
      let rowIndex = -1;

      for (let i = 0; i < rows.length; i++) {
        if (rows[i][2] === fileId) { // Column C contains originalFileId
          rowIndex = i + 1; // +1 because sheets are 1-indexed
          break;
        }
      }

      if (rowIndex === -1) {
        throw new Error(`Entry not found for file ID: ${fileId}`);
      }

      // Update the status column (D)
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!D${rowIndex}`,
        valueInputOption: 'RAW',
        resource: {
          values: [[status]]
        }
      });

      // Update additional data if provided
      if (Object.keys(additionalData).length > 0) {
        const updatePromises = [];
        
        if (additionalData.processingTime !== undefined) {
          updatePromises.push(
            this.sheets.spreadsheets.values.update({
              spreadsheetId: this.spreadsheetId,
              range: `${this.sheetName}!I${rowIndex}`,
              valueInputOption: 'RAW',
              resource: {
                values: [[additionalData.processingTime.toFixed(2)]]
              }
            })
          );
        }

        if (additionalData.errorMessage !== undefined) {
          updatePromises.push(
            this.sheets.spreadsheets.values.update({
              spreadsheetId: this.spreadsheetId,
              range: `${this.sheetName}!J${rowIndex}`,
              valueInputOption: 'RAW',
              resource: {
                values: [[additionalData.errorMessage]]
              }
            })
          );
        }

        await Promise.all(updatePromises);
      }

      console.log(`Updated status for file ID ${fileId}: ${status}`);
    } catch (error) {
      console.error('Failed to update entry status:', error);
      throw new Error(`Failed to update status in Google Sheets: ${error.message}`);
    }
  }

  async getProcessingStats() {
    try {
      const entries = await this.getVideoEntries(1000);
      
      const stats = {
        total: entries.length,
        completed: entries.filter(e => e.status === 'COMPLETED').length,
        error: entries.filter(e => e.status === 'ERROR').length,
        processing: entries.filter(e => e.status === 'PROCESSING').length,
        totalSizeMB: entries.reduce((sum, e) => sum + parseFloat(e.totalSizeMB || 0), 0)
      };

      return stats;
    } catch (error) {
      console.error('Failed to get processing stats:', error);
      throw new Error(`Failed to get stats from Google Sheets: ${error.message}`);
    }
  }
}

module.exports = GoogleSheetsService;
