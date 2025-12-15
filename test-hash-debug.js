/**
 * Debug script to test integrity hash calculation
 * Usage: node test-hash-debug.js <path-to-exported-ssp.json>
 */

import fs from 'fs';
import { calculateIntegrityHash, verifyIntegrityHash, addIntegrityHash } from './backend/integrityService.js';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node test-hash-debug.js <path-to-ssp.json>');
  process.exit(1);
}

const filePath = args[0];
console.log(`\n📄 Reading file: ${filePath}\n`);

// Read the exported SSP
const fileContent = fs.readFileSync(filePath, 'utf8');
const ssp = JSON.parse(fileContent);

console.log('=== EXPORTED FILE ANALYSIS ===\n');

// Check metadata props
const metadata = ssp['system-security-plan']?.metadata || ssp.metadata;
console.log(`Metadata props count: ${metadata?.props?.length || 0}`);
if (metadata?.props) {
  console.log('\nProps in exported file:');
  metadata.props.forEach((p, i) => {
    console.log(`  [${i}] name: ${p.name}`);
    console.log(`      ns: ${p.ns || 'none'}`);
    console.log(`      value: ${p.value?.substring(0, 50)}${p.value?.length > 50 ? '...' : ''}`);
    console.log('');
  });
}

// Verify the hash
console.log('\n=== INTEGRITY VERIFICATION ===\n');
const verification = verifyIntegrityHash(ssp);
console.log('Verification result:', JSON.stringify(verification, null, 2));

// Calculate hash manually
console.log('\n=== MANUAL HASH CALCULATION ===\n');
const calculatedHash = calculateIntegrityHash(ssp);
console.log('Calculated hash:', calculatedHash);

console.log('\n=== COMPARISON ===\n');
if (verification.storedHash && verification.calculatedHash) {
  console.log('Stored hash:    ', verification.storedHash);
  console.log('Calculated hash:', verification.calculatedHash);
  console.log('Match:', verification.storedHash === verification.calculatedHash ? '✅ YES' : '❌ NO');
}

console.log('\n');

