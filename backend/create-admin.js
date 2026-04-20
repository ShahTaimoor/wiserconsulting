#!/usr/bin/env node
/**
 * Admin Account Setup Script
 * Usage: node create-admin.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const User = require('./models/User');
const connectDB = require('./config/db');

const adminCredentials = {
  name: 'Admin User',
  email: 'admin@wiserconsulting.com',
  password: 'Admin@123456'
};

async function createAdmin() {
  try {
    console.log('\n🔧 Creating Admin Account...\n');

    // Connect to database
    await connectDB();
    console.log('✅ Connected to MongoDB\n');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminCredentials.email });
    if (existingAdmin) {
      console.log(`⚠️  Admin with email "${adminCredentials.email}" already exists!`);
      console.log(`\n📧 Email: ${adminCredentials.email}`);
      console.log(`🔑 Password: (unchanged - use existing password)\n`);
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(adminCredentials.password, 10);

    // Create admin user
    const admin = new User({
      name: adminCredentials.name,
      email: adminCredentials.email,
      password: hashedPassword,
      role: 1 // Admin role
    });

    await admin.save();
    console.log('✅ Admin account created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email: ' + adminCredentials.email);
    console.log('🔑 Password: ' + adminCredentials.password);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Use these credentials to log in to the admin panel.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin account:', error.message);
    process.exit(1);
  }
}

createAdmin();
