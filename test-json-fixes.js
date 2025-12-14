#!/usr/bin/env node

/**
 * Test script to validate JSON parsing fixes
 * Tests various failure scenarios to ensure proper JSON responses
 */

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:3000';

// Test configuration
const TEST_TIMEOUT = 30000;
const TEST_FILES = {
  VALID_PDF: '/tmp/test-valid.pdf',
  EMPTY_FILE: '/tmp/test-empty.pdf',
  LARGE_FILE: '/tmp/test-large.pdf',
};

// Utility to create test PDF files
function createTestPdf(filename, size = 1024) {
  const buffer = Buffer.alloc(size, 0x25); // '%' character
  buffer.write('PDF-1.4\n', 0);
  writeFileSync(filename, buffer);
}

function createEmptyFile(filename) {
  writeFileSync(filename, Buffer.alloc(0));
}

function createLargeFile(filename, sizeMB = 50) {
  const size = sizeMB * 1024 * 1024;
  const buffer = Buffer.alloc(size);
  writeFileSync(filename, buffer);
}

async function makeRequest(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type');
    let body;
    
    if (contentType && contentType.includes('application/json')) {
      try {
        body = await response.json();
      } catch (e) {
        body = { parseError: 'Failed to parse JSON', raw: await response.text() };
      }
    } else {
      body = await response.text();
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      ok: response.ok,
    };
  } catch (error) {
    return {
      error: error.message,
      status: 0,
      headers: {},
      body: null,
      ok: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function testEndpoint(url, description, expectedStatus = 200) {
  console.log(`\n🧪 Testing: ${description}`);
  console.log(`   URL: ${url}`);

  const result = await makeRequest(url);
  
  console.log(`   Status: ${result.status}`);
  console.log(`   OK: ${result.ok}`);
  console.log(`   Content-Type: ${result.headers['content-type'] || 'None'}`);

  // Validate JSON responses
  if (result.headers['content-type'] && result.headers['content-type'].includes('application/json')) {
    if (result.body && typeof result.body === 'object') {
      console.log(`   ✅ Valid JSON response`);
      console.log(`   Response: ${JSON.stringify(result.body, null, 2).substring(0, 200)}...`);
    } else {
      console.log(`   ❌ Invalid JSON response`);
      console.log(`   Response: ${result.body}`);
    }
  } else if (result.status >= 400) {
    console.log(`   ❌ Non-JSON error response (${result.headers['content-type'] || 'None'})`);
  } else {
    console.log(`   ℹ️  Non-JSON response (likely intended)`);
  }

  return result;
}

async function testUpload(endpoint, filename, description, formDataOptions = {}) {
  console.log(`\n📤 Testing: ${description}`);
  console.log(`   Endpoint: ${endpoint}`);

  try {
    const formData = new FormData();
    
    // Add form fields
    if (formDataOptions.fields) {
      Object.entries(formDataOptions.fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    // Add file if provided
    if (filename && filename !== '/tmp/NONE') {
      try {
        const fileContent = readFileSync(filename);
        const file = new File([fileContent], 'test.pdf', { type: 'application/pdf' });
        formData.append('file', file);
      } catch (e) {
        console.log(`   ⚠️  Could not read file ${filename}: ${e.message}`);
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });

    const contentType = response.headers.get('content-type');
    let body;
    
    try {
      if (contentType && contentType.includes('application/json')) {
        body = await response.json();
      } else {
        body = await response.text();
      }
    } catch (e) {
      body = { parseError: 'Failed to parse response', error: e.message };
    }

    console.log(`   Status: ${response.status}`);
    console.log(`   Content-Type: ${contentType || 'None'}`);
    console.log(`   Response: ${JSON.stringify(body, null, 2).substring(0, 300)}...`);

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      ok: response.ok,
    };
  } catch (error) {
    console.log(`   ❌ Request failed: ${error.message}`);
    return {
      error: error.message,
      status: 0,
      headers: {},
      body: null,
      ok: false,
    };
  }
}

async function runTests() {
  console.log('🚀 Starting JSON parsing validation tests...\n');

  // Create test files
  console.log('📁 Creating test files...');
  createTestPdf(TEST_FILES.VALID_PDF, 2048);
  createEmptyFile(TEST_FILES.EMPTY_FILE);
  createLargeFile(TEST_FILES.LARGE_FILE, 50); // 50MB file
  console.log('✅ Test files created\n');

  const results = [];

  try {
    // Test 1: Invalid endpoints (should return JSON errors)
    results.push(await testEndpoint(`${BASE_URL}/api/invalid`, 'Invalid endpoint'));
    results.push(await testEndpoint(`${BASE_URL}/api/translate/invalid-job-id/status`, 'Invalid job ID status check', 404));

    // Test 2: Upload tests - comic API
    results.push(await testUpload(`${BASE_URL}/api/comic`, '/tmp/NONE', 'Comic API - No file or text', {
      fields: { visualStyle: 'manga', panelCount: '6', panelsPerPage: '4' }
    }));
    
    results.push(await testUpload(`${BASE_URL}/api/comic`, TEST_FILES.EMPTY_FILE, 'Comic API - Empty file', {
      fields: { visualStyle: 'manga', panelCount: '6', panelsPerPage: '4' }
    }));

    results.push(await testUpload(`${BASE_URL}/api/comic`, TEST_FILES.LARGE_FILE, 'Comic API - Oversized file', {
      fields: { visualStyle: 'manga', panelCount: '6', panelsPerPage: '4' }
    }));

    results.push(await testUpload(`${BASE_URL}/api/comic`, '/tmp/NONE', 'Comic API - Text only', {
      fields: { 
        visualStyle: 'manga', 
        panelCount: '6', 
        panelsPerPage: '4',
        text: 'This is a test story for comic generation. '.repeat(1000) // Very long text
      }
    }));

    results.push(await testUpload(`${BASE_URL}/api/comic`, TEST_FILES.VALID_PDF, 'Comic API - Valid PDF', {
      fields: { visualStyle: 'manga', panelCount: '6', panelsPerPage: '4' }
    }));

    // Test 3: Upload tests - translation API
    results.push(await testUpload(`${BASE_URL}/api/translate`, '/tmp/NONE', 'Translate API - No file'));

    results.push(await testUpload(`${BASE_URL}/api/translate`, TEST_FILES.EMPTY_FILE, 'Translate API - Empty file'));

    results.push(await testUpload(`${BASE_URL}/api/translate`, TEST_FILES.LARGE_FILE, 'Translate API - Oversized file'));

    results.push(await testUpload(`${BASE_URL}/api/translate`, TEST_FILES.VALID_PDF, 'Translate API - Valid PDF'));

    // Test 4: Test invalid form data parsing
    results.push(await testUpload(`${BASE_URL}/api/translate`, '/tmp/NONE', 'Translate API - Malformed request', {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
  } finally {
    // Cleanup test files
    console.log('\n🧹 Cleaning up test files...');
    try { unlinkSync(TEST_FILES.VALID_PDF); } catch {}
    try { unlinkSync(TEST_FILES.EMPTY_FILE); } catch {}
    try { unlinkSync(TEST_FILES.LARGE_FILE); } catch {}
    console.log('✅ Cleanup complete\n');
  }

  // Summary
  console.log('📊 Test Results Summary:');
  console.log('='.repeat(50));

  let totalTests = results.length;
  let jsonResponses = 0;
  let properErrors = 0;

  results.forEach((result, index) => {
    const testNum = index + 1;
    const hasJsonContentType = result.headers['content-type']?.includes('application/json');
    const isError = result.status >= 400;
    
    if (hasJsonContentType) jsonResponses++;
    if (isError && hasJsonContentType) properErrors++;

    const status = result.ok ? '✅' : '❌';
    const jsonMark = hasJsonContentType ? '📄' : '⚠️';
    console.log(`Test ${testNum}: ${status} Status ${result.status} ${jsonMark}`);
  });

  console.log('\n📈 Statistics:');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`JSON Responses: ${jsonResponses} (${Math.round(jsonResponses/totalTests*100)}%)`);
  console.log(`Proper Error JSON: ${properErrors}/${results.filter(r => r.status >= 400).length}`);

  const success = jsonResponses >= totalTests * 0.8; // At least 80% should return JSON
  console.log(`\n${success ? '✅' : '❌'} JSON Parsing Fix: ${success ? 'SUCCESS' : 'NEEDS ATTENTION'}`);

  return success;
}

// Run tests
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });