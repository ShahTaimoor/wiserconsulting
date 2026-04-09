require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('🔍 Testing Email Configuration...\n');

// Check environment variable
console.log('Environment Variables Check:');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? '✅ Set' : '❌ Missing');
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? '✅ Set' : '❌ Missing');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('');

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.log('❌ Missing required environment variables!');
  console.log('Please create a .env file with EMAIL_USER and EMAIL_PASS');
  console.log('See EMAIL_SETUP.md for detailed instructions');
  process.exit(1);
}

// Test email configuration
async function testEmail() {
  try {
    console.log('📧 Testing email connection...');
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // Verify connection
    await transporter.verify();
    console.log('✅ Email connection successful!');
    
    console.log('\n📝 Sending test email...');
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: 'Test Email from Your Website',
      html: `
        <h2>Test Email</h2>
        <p>This is a test email to verify your email configuration is working correctly.</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Server:</strong> Your Website Backend</p>
        <hr>
        <p><em>If you receive this email, your contact form is ready to use!</em></p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Test email sent successfully!');
    console.log('📬 Check your Gmail inbox for the test email');
    
  } catch (error) {
    console.log('❌ Email test failed:');
    console.log('Error Code:', error.code);
    console.log('Error Message:', error.message);
    
    if (error.code === 'EAUTH') {
      console.log('\n🔐 Authentication Error:');
      console.log('- Check that EMAIL_USER is your correct Gmail address');
      console.log('- Check that EMAIL_PASS is your 16-character app password (not regular password)');
      console.log('- Make sure 2-Factor Authentication is enabled on your Gmail account');
    } else if (error.code === 'ENOTFOUND') {
      console.log('\n🌐 Connection Error:');
      console.log('- Check your internet connection');
      console.log('- Gmail servers might be temporarily unavailable');
    }
    
    console.log('\n📖 See EMAIL_SETUP.md for detailed setup instructions');
  }
}

testEmail();
