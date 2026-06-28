/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import { getAllUsers, deactivateUser } from '../auth/userManager.js';
import { addToBlocklist, cleanupExpiredBlocklist } from '../auth/emailBlocklist.js';

// Inactivity threshold: 30 days
export const INACTIVITY_DAYS = 30;

/**
 * Calculate days since last login
 * @param {string|null} lastLoginAt - ISO timestamp of last login
 * @returns {number} - Days since last login (or since creation if never logged in)
 */
function getDaysSinceLastLogin(user) {
  const now = new Date();
  
  // If user has logged in, use lastLoginAt
  if (user.lastLoginAt) {
    const lastLogin = new Date(user.lastLoginAt);
    return Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24));
  }
  
  // If user has never logged in, use account creation date
  if (user.createdAt) {
    const created = new Date(user.createdAt);
    return Math.floor((now - created) / (1000 * 60 * 60 * 24));
  }
  
  return 0;
}

/**
 * Clean up inactive self-registered users
 * Deactivates users who haven't logged in for 30+ days
 * Only affects users created via self-registration
 * 
 * @returns {Promise<Object>} - Cleanup results
 */
export async function cleanupInactiveUsers() {
  console.log('\n🧹 Starting user cleanup job...');
  console.log(`   Current time: ${new Date().toISOString()}`);
  console.log(`   Inactivity threshold: ${INACTIVITY_DAYS} days`);
  
  const results = {
    totalUsers: 0,
    selfRegisteredUsers: 0,
    inactiveUsers: 0,
    deactivated: [],
    blocklisted: [],
    errors: [],
    timestamp: new Date().toISOString()
  };
  
  try {
    // Get all users
    const users = await getAllUsers();
    results.totalUsers = users.length;
    
    console.log(`   Total users in system: ${results.totalUsers}`);
    
    // Filter self-registered users
    const selfRegisteredUsers = users.filter(u => u.createdVia === 'self-registration');
    results.selfRegisteredUsers = selfRegisteredUsers.length;
    
    console.log(`   Self-registered users: ${results.selfRegisteredUsers}`);
    
    // Check each self-registered user for inactivity
    for (const user of selfRegisteredUsers) {
      try {
        // Skip already deactivated users
        if (!user.isActive) {
          continue;
        }
        
        const daysSinceLastLogin = getDaysSinceLastLogin(user);
        
        console.log(`   Checking user: ${user.email}`);
        console.log(`      Days since last activity: ${daysSinceLastLogin}`);
        console.log(`      Last login: ${user.lastLoginAt || 'Never'}`);
        console.log(`      Created: ${user.createdAt}`);
        
        // Deactivate if inactive for threshold days or more
        if (daysSinceLastLogin >= INACTIVITY_DAYS) {
          console.log(`   ⚠️ User is inactive (${daysSinceLastLogin} days), deactivating...`);
          results.inactiveUsers++;
          
          try {
            // Deactivate user
            await deactivateUser(user.id, 'auto-cleanup');
            console.log(`   ✅ User deactivated: ${user.email}`);
            
            results.deactivated.push({
              email: user.email,
              username: user.username,
              daysSinceLastLogin: daysSinceLastLogin,
              lastLoginAt: user.lastLoginAt,
              createdAt: user.createdAt
            });
            
            // Add email to blocklist (30-day cooldown)
            try {
              await addToBlocklist(user.email);
              console.log(`   ✅ Email added to blocklist: ${user.email}`);
              
              results.blocklisted.push({
                email: user.email,
                expiresInDays: INACTIVITY_DAYS
              });
            } catch (blocklistError) {
              console.error(`   ❌ Failed to blocklist email ${user.email}:`, blocklistError.message);
              results.errors.push({
                email: user.email,
                action: 'blocklist',
                error: blocklistError.message
              });
            }
            
          } catch (deactivateError) {
            console.error(`   ❌ Failed to deactivate user ${user.email}:`, deactivateError.message);
            results.errors.push({
              email: user.email,
              action: 'deactivate',
              error: deactivateError.message
            });
          }
        } else {
          const daysRemaining = INACTIVITY_DAYS - daysSinceLastLogin;
          console.log(`   ✓ User is active (${daysRemaining} days until cleanup)`);
        }
        
      } catch (userError) {
        console.error(`   ❌ Error processing user ${user.email}:`, userError.message);
        results.errors.push({
          email: user.email,
          action: 'process',
          error: userError.message
        });
      }
    }
    
    // Clean up expired blocklist entries
    console.log('\n🧹 Cleaning up expired blocklist entries...');
    try {
      const removedCount = await cleanupExpiredBlocklist();
      console.log(`   ✅ Removed ${removedCount} expired blocklist entry(ies)`);
    } catch (cleanupError) {
      console.error(`   ❌ Failed to cleanup blocklist:`, cleanupError.message);
      results.errors.push({
        action: 'blocklist-cleanup',
        error: cleanupError.message
      });
    }
    
    // Log summary
    console.log('\n📊 User Cleanup Summary:');
    console.log(`   Total users: ${results.totalUsers}`);
    console.log(`   Self-registered users: ${results.selfRegisteredUsers}`);
    console.log(`   Inactive users found: ${results.inactiveUsers}`);
    console.log(`   Users deactivated: ${results.deactivated.length}`);
    console.log(`   Emails blocklisted: ${results.blocklisted.length}`);
    console.log(`   Errors: ${results.errors.length}`);
    
    if (results.deactivated.length > 0) {
      console.log('\n   Deactivated users:');
      results.deactivated.forEach(u => {
        console.log(`   - ${u.email} (inactive for ${u.daysSinceLastLogin} days)`);
      });
    }
    
    if (results.errors.length > 0) {
      console.log('\n   ⚠️ Errors encountered:');
      results.errors.forEach(e => {
        console.log(`   - ${e.email || 'system'}: ${e.action} - ${e.error}`);
      });
    }
    
    console.log('\n✅ User cleanup job completed\n');
    
  } catch (error) {
    console.error('❌ Critical error in user cleanup job:', error);
    results.errors.push({
      action: 'cleanup-job',
      error: error.message,
      stack: error.stack
    });
  }
  
  return results;
}

/**
 * Schedule cleanup job to run daily
 * @param {number} intervalMs - Interval in milliseconds (default: 24 hours)
 * @returns {Object} - Interval object for cancellation
 */
export function scheduleUserCleanup(intervalMs = 24 * 60 * 60 * 1000) {
  console.log(`⏰ Scheduling user cleanup job to run every ${intervalMs / (60 * 60 * 1000)} hours`);
  
  // Run immediately on startup
  cleanupInactiveUsers().catch(err => {
    console.error('Error in initial cleanup run:', err);
  });
  
  // Schedule recurring cleanup
  const interval = setInterval(() => {
    cleanupInactiveUsers().catch(err => {
      console.error('Error in scheduled cleanup run:', err);
    });
  }, intervalMs);
  
  return interval;
}

export default {
  cleanupInactiveUsers,
  scheduleUserCleanup
};
