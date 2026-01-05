/**
 * Messaging Service - Send notifications via Email or Slack
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import axios from 'axios';
import { loadConfig } from './configManager.js';

/**
 * Send user credentials via configured messaging channel
 * @param {string} email - User email address
 * @param {string} username - Username (email)
 * @param {string} password - Generated password
 * @param {string} fullName - User full name
 * @returns {Promise<Object>} - Result object with success status
 */
export async function sendUserCredentials(email, username, password, fullName) {
  const config = loadConfig();
  const messagingConfig = config.messagingConfig || {};
  
  if (!messagingConfig.enabled) {
    console.warn('⚠️ Messaging is not configured. User credentials not sent.');
    return { success: false, error: 'Messaging not configured' };
  }
  
  const channel = messagingConfig.channel || 'email';
  
  try {
    if (channel === 'email') {
      return await sendEmail(email, username, password, fullName, messagingConfig.email);
    } else if (channel === 'slack') {
      return await sendSlackMessage(email, username, password, fullName, messagingConfig.slack);
    } else {
      return { success: false, error: 'Unknown messaging channel' };
    }
  } catch (error) {
    console.error('❌ Error sending user credentials:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send email with user credentials
 * @param {string} to - Recipient email
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string} fullName - User full name
 * @param {Object} emailConfig - Email configuration
 * @returns {Promise<Object>}
 */
async function sendEmail(to, username, password, fullName, emailConfig) {
  if (!emailConfig || !emailConfig.enabled) {
    return { success: false, error: 'Email not configured' };
  }
  
  if (!emailConfig.smtpHost || !emailConfig.smtpPort || !emailConfig.smtpUser || !emailConfig.fromEmail) {
    return { success: false, error: 'Email configuration incomplete. Please configure SMTP settings.' };
  }
  
  try {
    // Dynamic import to avoid loading if not needed
    const nodemailer = await import('nodemailer');
    
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: emailConfig.smtpHost,
      port: emailConfig.smtpPort,
      secure: emailConfig.smtpSecure, // true for 465, false for other ports
      auth: {
        user: emailConfig.smtpUser,
        pass: emailConfig.smtpPassword
      }
    });
    
    // Verify connection
    await transporter.verify();
    console.log('✅ SMTP connection verified');
    
    const subject = 'Your OSCAL Report Generator Account Credentials';
    const htmlMessage = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1976d2; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .credentials { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #1976d2; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Account Created</h1>
    </div>
    <div class="content">
      <p>Hello ${fullName || username.split('@')[0]},</p>
      <p>Your account has been created for the <strong>OSCAL Report Generator</strong> platform.</p>
      
      <div class="credentials">
        <h3>Your Account Credentials:</h3>
        <p><strong>Username:</strong> ${username}</p>
        <p><strong>Password:</strong> <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">${password}</code></p>
      </div>
      
      ${emailConfig.loginUrl ? `<p><a href="${emailConfig.loginUrl}" style="background: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Log In Now</a></p>` : ''}
      
      <p><strong>⚠️ Important:</strong> Please change your password immediately after first login for security.</p>
      
      <p>If you did not request this account, please contact your administrator.</p>
    </div>
    <div class="footer">
      <p>Best regards,<br>OSCAL Report Generator Team</p>
    </div>
  </div>
</body>
</html>
    `.trim();
    
    const textMessage = `
Hello ${fullName || username.split('@')[0]},

Your account has been created for the OSCAL Report Generator platform.

Account Details:
- Username: ${username}
- Password: ${password}

${emailConfig.loginUrl ? `Log in at: ${emailConfig.loginUrl}` : ''}

Please change your password immediately after first login for security.

If you did not request this account, please contact your administrator.

Best regards,
OSCAL Report Generator Team
    `.trim();
    
    // Send email
    const info = await transporter.sendMail({
      from: `"${emailConfig.fromName}" <${emailConfig.fromEmail}>`,
      to: to,
      subject: subject,
      text: textMessage,
      html: htmlMessage
    });
    
    console.log(`✅ Email sent successfully to: ${to}`);
    console.log(`   Message ID: ${info.messageId}`);
    
    return { success: true, channel: 'email', message: 'Email sent successfully', messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
}

/**
 * Send Slack message with user credentials
 * @param {string} email - User email
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string} fullName - User full name
 * @param {Object} slackConfig - Slack configuration
 * @returns {Promise<Object>}
 */
async function sendSlackMessage(email, username, password, fullName, slackConfig) {
  if (!slackConfig || !slackConfig.enabled || !slackConfig.webhookUrl) {
    return { success: false, error: 'Slack not configured' };
  }
  
  const message = {
    text: `New User Account Created`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔐 New User Account Created'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Email:*\n${email}`
          },
          {
            type: 'mrkdwn',
            text: `*Full Name:*\n${fullName || username.split('@')[0]}`
          },
          {
            type: 'mrkdwn',
            text: `*Username:*\n${username}`
          },
          {
            type: 'mrkdwn',
            text: `*Password:*\n\`${password}\``
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '⚠️ *Please share these credentials securely with the user.*'
        }
      }
    ]
  };
  
  try {
    const response = await axios.post(slackConfig.webhookUrl, message, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.status === 200) {
      console.log(`✅ Slack message sent successfully to: ${slackConfig.channel || 'default channel'}`);
      return { success: true, channel: 'slack', message: 'Slack message sent' };
    } else {
      return { success: false, error: `Slack API returned status ${response.status}` };
    }
  } catch (error) {
    console.error('❌ Error sending Slack message:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.error || error.message };
  }
}

/**
 * Test email configuration
 * @param {Object} emailConfig - Email configuration
 * @returns {Promise<Object>}
 */
export async function testEmailConfig(emailConfig) {
  if (!emailConfig || !emailConfig.enabled) {
    return { success: false, error: 'Email not enabled' };
  }
  
  if (!emailConfig.smtpHost || !emailConfig.smtpPort || !emailConfig.smtpUser || !emailConfig.fromEmail) {
    return { success: false, error: 'Email configuration incomplete' };
  }
  
  try {
    const nodemailer = await import('nodemailer');
    
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: emailConfig.smtpHost,
      port: emailConfig.smtpPort,
      secure: emailConfig.smtpSecure,
      auth: {
        user: emailConfig.smtpUser,
        pass: emailConfig.smtpPassword
      }
    });
    
    // Verify connection
    await transporter.verify();
    
    // Send test email to the from address
    const testMessage = {
      from: `"${emailConfig.fromName}" <${emailConfig.fromEmail}>`,
      to: emailConfig.fromEmail, // Send test to self
      subject: 'Test Email - OSCAL Report Generator',
      text: 'This is a test email from OSCAL Report Generator. If you receive this, your email configuration is working correctly.',
      html: '<p>This is a <strong>test email</strong> from OSCAL Report Generator.</p><p>If you receive this, your email configuration is working correctly.</p>'
    };
    
    const info = await transporter.sendMail(testMessage);
    
    return { 
      success: true, 
      message: `Test email sent successfully to ${emailConfig.fromEmail}`,
      messageId: info.messageId
    };
  } catch (error) {
    console.error('❌ Email test error:', error);
    return { success: false, error: error.message || 'Failed to test email configuration' };
  }
}

/**
 * Test Slack configuration
 * @param {Object} slackConfig - Slack configuration
 * @returns {Promise<Object>}
 */
export async function testSlackConfig(slackConfig) {
  if (!slackConfig.webhookUrl) {
    return { success: false, error: 'Slack webhook URL is required' };
  }
  
  const testMessage = {
    text: 'Test message from OSCAL Report Generator',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '✅ *Slack Integration Test*\n\nIf you receive this message, your Slack configuration is working correctly.'
        }
      }
    ]
  };
  
  try {
    const response = await axios.post(slackConfig.webhookUrl, testMessage, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.status === 200) {
      return { success: true, message: 'Test message sent successfully' };
    } else {
      return { success: false, error: `Slack API returned status ${response.status}` };
    }
  } catch (error) {
    return { success: false, error: error.response?.data?.error || error.message };
  }
}

