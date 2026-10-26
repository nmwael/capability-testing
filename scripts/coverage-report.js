#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Simple YAML parser for the specific format in capabilities.yml
function parseCapabilitiesYml(content) {
  const capabilities = [];
  const lines = content.split('\n');
  let inCapability = false;
  let currentCapability = null;
  let verifiedByIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line === 'verified_by:') {
      inCapability = true;
      verifiedByIndex = 0;
      continue;
    }
    
    if (inCapability) {
      if (line.startsWith('- ')) {
        const testClass = line.substring(2);
        const comment = line.split('#')[1]?.trim();
        if (currentCapability) {
          currentCapability.verifiedBy.push({
            testClass,
            comment
          });
        }
      } else if (line === '' || line.startsWith('   -')) {
        continue;
      } else if (line && !line.startsWith('- ')) {
        // End of verified_by section, start new capability
        if (currentCapability) {
          capabilities.push(currentCapability);
        }
        currentCapability = null;
        inCapability = false;
      }
    } else if (line.startsWith('- id:')) {
      if (currentCapability) {
        capabilities.push(currentCapability);
      }
      currentCapability = {
        id: line.match(/id:\s*(\S+)/)?.[1],
        intent: lines[i + 1]?.trim().replace(/^"/, '').replace(/"$/, '') || '',
        owner: lines[i + 2]?.trim() || '',
        status: lines[i + 4]?.trim() || '',
        since: lines[i + 6]?.trim() || '',
        verifiedBy: []
      };
      verifiedByIndex = 0;
      i += 6; // Skip to verified_by line
    }
  }
  
  if (currentCapability) {
    capabilities.push(currentCapability);
  }
  
  return capabilities;
}

// Generate HTML coverage report
function generateCoverageHTML(capabilities, outputPath) {
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Coverage Report</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
      background-color: #f5f5f5;
    }
    h1 {
      color: #333;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #4CAF50;
      color: white;
    }
    tr:hover {
      background-color: #f5f5f5;
    }
    .status-active {
      color: #2e7d32;
      font-weight: bold;
    }
    .status-draft {
      color: #f57c00;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <h1>Coverage Report</h1>
  <table>
    <thead>
      <tr>
        <th>Capability</th>
        <th>Verification Method</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
`;

  for (const cap of capabilities) {
    html += `      <tr>
        <td>${escapeHTML(cap.id)}</td>
        <td>${formatVerificationMethods(cap.verifiedBy)}</td>
        <td class="status-${cap.status.toLowerCase()}">${escapeHTML(cap.status)}</td>
      </tr>
`;
  }

  html += `    </tbody>
  </table>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
  console.log(`Coverage report generated at: ${outputPath}`);
  console.log(`Total capabilities: ${capabilities.length}`);
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatVerificationMethods(verifiedBy) {
  if (!verifiedBy || verifiedBy.length === 0) return '';
  
  let result = verifiedBy.map(v => v.testClass).join(', ');
  
  // Add comments if present
  if (verifiedBy.some(v => v.comment)) {
    const comments = verifiedBy
      .filter(v => v.comment)
      .map(v => v.comment)
      .join('; ');
    result += ` (${comments})`;
  }
  
  return result;
}

// Main
function main() {
  const args = process.argv.slice(2);
  
  let capabilitiesPath = 'capabilities/capabilities.yml';
  let outputPath = 'docs/coverage/index.html';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--capabilities' && args[i + 1]) {
      capabilitiesPath = args[++i];
    } else if (args[i] === '--out' && args[i + 1]) {
      outputPath = args[++i];
    }
  }
  
  const content = fs.readFileSync(capabilitiesPath, 'utf8');
  const capabilities = parseCapabilitiesYml(content);
  generateCoverageHTML(capabilities, outputPath);
  process.exit(0);
}

main();
