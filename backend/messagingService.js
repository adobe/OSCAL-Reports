/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import axios from './utils/safeAxios.js';
import { getResolvedConfig } from './configManager.js';

/**
 * Send user credentials via configured Slack messaging channel.
 * @param {string} email - User email address
 * @param {string} username - Username (email)
 * @param {string} password - Generated password
 * @param {string} fullName - User full name
 * @returns {Promise<Object>} - Result object with success status
 */
export async function sendUserCredentials(email, username, password, fullName) {
  const config = getResolvedConfig();
  const messagingConfig = config.messagingConfig || {};

  if (!messagingConfig.enabled) {
    console.warn('⚠️ Messaging is not configured. User credentials not sent.');
    return { success: false, error: 'Messaging not configured' };
  }

  const channel = messagingConfig.channel || 'slack';
  if (channel !== 'slack') {
    return { success: false, error: 'Only Slack messaging is supported' };
  }

  try {
    return await sendSlackMessage(email, username, password, fullName, messagingConfig.slack);
  } catch (error) {
    console.error('❌ Error sending user credentials:', error);
    return { success: false, error: error.message };
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
    text: 'New User Account Created',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔐 New User Account Created',
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Email:*\n${email}`,
          },
          {
            type: 'mrkdwn',
            text: `*Full Name:*\n${fullName || username.split('@')[0]}`,
          },
          {
            type: 'mrkdwn',
            text: `*Username:*\n${username}`,
          },
          {
            type: 'mrkdwn',
            text: `*Password:*\n\`${password}\``,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '⚠️ *Please share these credentials securely with the user.*',
        },
      },
    ],
  };

  try {
    const response = await axios.post(slackConfig.webhookUrl, message, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 200) {
      console.log(`✅ Slack message sent successfully to: ${slackConfig.channel || 'default channel'}`);
      return { success: true, channel: 'slack', message: 'Slack message sent' };
    }
    return { success: false, error: `Slack API returned status ${response.status}` };
  } catch (error) {
    console.error('❌ Error sending Slack message:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.error || error.message };
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
          text: '✅ *Slack Integration Test*\n\nIf you receive this message, your Slack configuration is working correctly.',
        },
      },
    ],
  };

  try {
    const response = await axios.post(slackConfig.webhookUrl, testMessage, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 200) {
      return { success: true, message: 'Test message sent successfully' };
    }
    return { success: false, error: `Slack API returned status ${response.status}` };
  } catch (error) {
    return { success: false, error: error.response?.data?.error || error.message };
  }
}
