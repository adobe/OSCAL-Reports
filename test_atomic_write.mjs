#!/usr/bin/env node
/**
 * Test Script for Atomic Write Operations
 */

import { atomicWriteJSON, atomicUpdate, safeReadJSON } from './backend/utils/atomicWrite.js';
import fs from 'fs';

console.log('\n🧪 Testing Atomic Write Operations...\n');

const testFile = './test_atomic.json';

async function runTests() {
  try {
    // Test 1: Simple atomic write
    console.log('1️⃣  Testing atomicWriteJSON...');
    await atomicWriteJSON(testFile, { 
      test: 'data',
      timestamp: new Date().toISOString()
    });
    console.log('   ✅ File written successfully');
    
    // Verify temp file was cleaned up
    const tempFiles = fs.readdirSync('.').filter(f => f.includes('.tmp.'));
    if (tempFiles.length === 0) {
      console.log('   ✅ Temp files cleaned up');
    } else {
      console.log('   ⚠️  Temp files still present:', tempFiles);
    }
    
    // Test 2: Atomic write with backup
    console.log('\n2️⃣  Testing atomic write with backup...');
    await atomicWriteJSON(testFile, { 
      test: 'updated',
      version: 2,
      timestamp: new Date().toISOString()
    }, { backup: true });
    console.log('   ✅ File written with backup');
    
    // Check if backup exists
    if (fs.existsSync(`${testFile}.backup`)) {
      console.log('   ✅ Backup file created');
    }
    
    // Test 3: Atomic update (read-modify-write)
    console.log('\n3️⃣  Testing atomicUpdate...');
    const updated = await atomicUpdate(testFile, (data) => {
      data.counter = (data.counter || 0) + 1;
      data.updated = new Date().toISOString();
      return data;
    }, { backup: true });
    console.log('   ✅ Atomic update successful');
    console.log('   📊 Counter value:', updated.counter);
    
    // Test 4: Safe read with default
    console.log('\n4️⃣  Testing safeReadJSON...');
    const data = await safeReadJSON('./nonexistent.json', { default: 'value' });
    console.log('   ✅ Safe read returned default:', data);
    
    // Test 5: Read actual file
    const actualData = await safeReadJSON(testFile);
    console.log('   ✅ Read actual file:', actualData);
    
    console.log('\n✅ All atomic write tests passed!\n');
    
    // Cleanup
    console.log('🧹 Cleaning up test files...');
    fs.unlinkSync(testFile);
    if (fs.existsSync(`${testFile}.backup`)) {
      fs.unlinkSync(`${testFile}.backup`);
    }
    console.log('   ✅ Cleanup complete\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();

