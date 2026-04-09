


const mongoose = require('mongoose');

const formSubmissionSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        phone: {
            type: String,
            required: true,
            trim: true,
        },
        destinationCountry: {
            type: String,
            required: true,
            trim: true,
        },
        otherCountry: {
            type: String,
            trim: true,
        },
        visaType: {
            type: String,
            required: true,
            trim: true,
        },
        fromDate: {
            type: String,
            required: true,
        },
        toDate: {
            type: String,
            required: true,
        },
        purpose: {
            type: String,
            required: true,
            trim: true,
        },
        documents: [{
            fieldName: String,
            originalname: String,
            filename: String,
            mimetype: String,
            size: Number,
            cloudinaryUrl: String,
            cloudinaryPublicId: String,
            cloudinaryId: String,
            localPath: String, // For local file storage
            uploadType: String, // 'cloudinary' or 'local'
            comment: String, // Add this for admin comments
        }],
        status: {
            type: String,
            enum: ['pending', 'reviewed', 'contacted', 'completed'],
            default: 'pending'
        },
        adminComments: [{
            documentId: String,
            documentName: String,
            comment: String,
            createdAt: {
                type: Date,
                default: Date.now
            }
        }],
        customerComments: [{
            message: String,
            createdAt: {
                type: Date,
                default: Date.now
            }
        }],
        isDeleted: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

// Index for frequently used fields
formSubmissionSchema.index({ email: 1 });
formSubmissionSchema.index({ status: 1 });
formSubmissionSchema.index({ isDeleted: 1 });
formSubmissionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('FormSubmission', formSubmissionSchema);