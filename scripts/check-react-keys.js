#!/usr/bin/env node

/**
 * Runtime check for React key issues
 * Run this as part of the build process to catch key-related problems
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Checking for React key issues...\n');

const srcDir = path.join(__dirname, '..', 'src');
let hasIssues = false;

// Patterns that might indicate key problems
const suspiciousPatterns = [
  /key=\{undefined\}/g,
  /key=\{null\}/g,
  /key=\{.*\?\?.*\?\?.*\}/g, // Triple nullish coalescing might indicate desperation
  /getEphemeralKey\([^,)]*\)/g, // getEphemeralKey without index parameter
];

// Files to check
const filesToCheck = [
  'src/components/MessageList/index.tsx',
  'src/components/MessageList/VirtualizedMessageList.tsx',
  'src/components/MessageList/MessageItem.tsx',
];

filesToCheck.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  File not found: ${file}`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check for undefined/null keys
  suspiciousPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      console.error(`❌ Suspicious key pattern in ${file}:`);
      matches.forEach(match => {
        console.error(`   ${match}`);
      });
      hasIssues = true;
    }
  });

  // Check that all .map() calls have proper keys
  const mapPattern = /\.map\s*\([^)]*\)\s*=>\s*(?:\(|\{)/g;
  const mapMatches = content.match(mapPattern);
  if (mapMatches) {
    mapMatches.forEach(match => {
      // Find the corresponding JSX element
      const startIndex = content.indexOf(match);
      const snippet = content.substring(startIndex, startIndex + 500);
      
      // Check if there's a key prop in the next JSX element
      if (snippet.includes('<') && !snippet.includes('key=')) {
        console.warn(`⚠️  Possible missing key in ${file} near: ${match.substring(0, 50)}...`);
      }
    });
  }
});

// Also check for runtime errors in the last build
console.log('\n📊 Checking recent logs for key warnings...\n');

try {
  // This would need to be adapted to your logging setup
  const logs = execSync('grep -i "same key" logs/*.log 2>/dev/null || true', { encoding: 'utf8' });
  if (logs) {
    console.error('❌ Found React key warnings in logs:');
    console.error(logs);
    hasIssues = true;
  }
} catch (e) {
  // No logs found or grep failed - that's ok
}

if (hasIssues) {
  console.error('\n❌ React key issues detected! Please fix before deploying.\n');
  process.exit(1);
} else {
  console.log('✅ No React key issues detected.\n');
}