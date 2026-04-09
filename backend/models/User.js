const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true
        },
        password: {
            type: String,
            required: function() {
                return !this.googleId; // Password only required if not Google auth
            },
            minLength: 6,
        },
        googleId: {
            type: String,
            unique: true,
            sparse: true
        },
        avatar: {
            type: String
        },
        role: {
            type: Number,
            default: 0
        },
        address: {
            type: String
        },
        phone: {
            type: String
        },
        city: {
            type: String
        },
        isDeleted: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

// Index for frequently used fields
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('User', userSchema);
