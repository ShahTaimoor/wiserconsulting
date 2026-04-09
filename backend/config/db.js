// config/db.js
const mongoose = require("mongoose");
const logger = require('../utils/logger');

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI;
        
        if (!mongoURI) {
            throw new Error("MONGODB_URI environment variable is not defined");
        }
        
        await mongoose.connect(mongoURI, {
           
        });
        logger.info("Connected to MongoDB");
    } catch (err) {
        logger.error("MongoDB connection error:", err.message);
        process.exit(1);
    }
};

module.exports = connectDB;
