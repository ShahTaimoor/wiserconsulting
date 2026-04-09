/**
 * Assessment Controller
 * Handles HTTP requests for assessment operations
 */

const assessmentService = require('../services/assessmentService');
const formSubmissionController = require('./formSubmissionController');
const fs = require('fs');
const path = require('path');

class AssessmentController {
  /**
   * Create submission (delegates to formSubmissionController)
   */
  async createSubmission(req, res, next) {
    return formSubmissionController.createSubmission(req, res, next);
  }

  /**
   * Merge PDFs
   */
  async mergePDFs(req, res, next) {
    try {
      const { submissionId, documentIds, customerName, customerEmail, filename } = req.body;

      const { filePath, fileName } = await assessmentService.mergePDFs(
        submissionId,
        documentIds,
        customerName,
        customerEmail,
        filename
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error('Error sending file:', err);
        }
        // Clean up temporary file
        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr) {
            console.error('Error deleting temporary file:', unlinkErr);
          }
        });
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Compress PDFs
   */
  async compressPDFs(req, res, next) {
    try {
      const { submissionId, documentIds, compressionLevel, customerName } = req.body;

      const { zipPath, zipFileName, tempDir } = await assessmentService.compressPDFs(
        submissionId,
        documentIds,
        compressionLevel,
        customerName
      );

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

      res.download(zipPath, zipFileName, (err) => {
        if (err) {
          console.error('Error sending ZIP file:', err);
        }
        // Clean up temporary files
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupErr) {
          console.error('Error cleaning up temp files:', cleanupErr);
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AssessmentController();

