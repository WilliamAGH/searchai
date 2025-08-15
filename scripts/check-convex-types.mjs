#!/usr/bin/env node

/**
 * Enhanced Convex type checking with IDE integration support
 * This script validates:
 * 1. All Convex function returns match schema
 * 2. No manual type definitions duplicating _generated types
 * 3. Proper use of Doc<> and Id<> types
 * 4. Validates function args/returns validators
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ANSI color codes for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

class ConvexTypeChecker {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.checkedFiles = 0;
  }

  /**
   * Run TypeScript compiler in type-check mode
   */
  async runTypeScriptCheck() {
    console.log(`${colors.blue}🔍 Running TypeScript type checking...${colors.reset}`);
    
    try {
      // Check main project
      const { stdout: mainStdout, stderr: mainStderr } = await execAsync(
        'npx tsc -p . --noEmit --pretty',
        { cwd: rootDir }
      );
      
      // Check Convex directory
      const { stdout: convexStdout, stderr: convexStderr } = await execAsync(
        'npx tsc -p convex --noEmit --pretty',
        { cwd: rootDir }
      );
      
      // Parse TypeScript errors
      this.parseTypeScriptOutput(mainStdout + mainStderr + convexStdout + convexStderr);
      
      return true;
    } catch (error) {
      // TypeScript returns non-zero exit code when there are errors
      this.parseTypeScriptOutput(error.stdout + error.stderr);
      return false;
    }
  }

  /**
   * Parse TypeScript compiler output for Convex-specific issues
   */
  parseTypeScriptOutput(output) {
    if (!output) return;
    
    const lines = output.split('\n');
    const convexTypeErrors = [];
    
    for (const line of lines) {
      // Look for Convex-specific type errors
      if (line.includes('Doc<') || line.includes('Id<')) {
        if (line.includes('Type') && line.includes('is not assignable')) {
          convexTypeErrors.push({
            type: 'type_mismatch',
            message: line.trim(),
          });
        }
      }
      
      // Check for missing returns validators
      if (line.includes('returns') && line.includes('expected')) {
        convexTypeErrors.push({
          type: 'missing_returns',
          message: line.trim(),
        });
      }
      
      // Check for args validation issues
      if (line.includes('args') && line.includes('v.')) {
        convexTypeErrors.push({
          type: 'args_validation',
          message: line.trim(),
        });
      }
    }
    
    this.errors.push(...convexTypeErrors);
  }

  /**
   * Check for common Convex type anti-patterns
   */
  async checkConvexPatterns() {
    console.log(`${colors.blue}🔍 Checking Convex type patterns...${colors.reset}`);
    
    const convexDir = path.join(rootDir, 'convex');
    const files = await this.getTypeScriptFiles(convexDir);
    
    for (const file of files) {
      if (file.includes('_generated')) continue;
      
      const content = await fs.readFile(file, 'utf-8');
      const relativePath = path.relative(rootDir, file);
      
      // Check 1: Manual Doc type definitions
      if (/interface\s+\w+\s*{\s*_id\s*:/.test(content)) {
        this.errors.push({
          file: relativePath,
          type: 'manual_doc_type',
          message: 'Manual Doc type definition found. Use Doc<TableName> from _generated/dataModel',
        });
      }
      
      // Check 2: String IDs instead of Id<TableName>
      const idPatterns = [
        /userId\s*:\s*string/,
        /chatId\s*:\s*string/,
        /messageId\s*:\s*string/,
      ];
      
      for (const pattern of idPatterns) {
        if (pattern.test(content)) {
          const match = content.match(pattern);
          this.warnings.push({
            file: relativePath,
            type: 'string_id',
            message: `Using string for ID field: ${match[0]}. Consider using Id<TableName>`,
          });
        }
      }
      
      // Check 3: Missing returns validator
      const functionPatterns = [
        /export\s+const\s+\w+\s*=\s*(?:query|mutation|action)\s*\(/g,
      ];
      
      for (const pattern of functionPatterns) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          const functionStart = match.index;
          const functionBlock = this.extractFunctionBlock(content, functionStart);
          
          if (!functionBlock.includes('returns:')) {
            // Check if it's not using v.null()
            if (!functionBlock.includes('returns: v.null()')) {
              this.warnings.push({
                file: relativePath,
                type: 'missing_returns',
                message: `Function missing 'returns' validator at position ${functionStart}`,
              });
            }
          }
        }
      }
      
      // Check 4: Ensure proper imports from _generated
      if (!content.includes('from "./_generated/')) {
        if (content.includes('query') || content.includes('mutation')) {
          this.warnings.push({
            file: relativePath,
            type: 'missing_generated_import',
            message: 'Convex function file should import from _generated directory',
          });
        }
      }
      
      this.checkedFiles++;
    }
  }

  /**
   * Extract a function block from content starting at given position
   */
  extractFunctionBlock(content, startPos) {
    let braceCount = 0;
    let inFunction = false;
    let endPos = startPos;
    
    for (let i = startPos; i < content.length; i++) {
      if (content[i] === '{') {
        braceCount++;
        inFunction = true;
      } else if (content[i] === '}') {
        braceCount--;
        if (inFunction && braceCount === 0) {
          endPos = i;
          break;
        }
      }
    }
    
    return content.substring(startPos, endPos + 1);
  }

  /**
   * Get all TypeScript files in a directory recursively
   */
  async getTypeScriptFiles(dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && entry.name !== '_generated') {
        files.push(...await this.getTypeScriptFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  /**
   * Generate IDE-compatible error format (for VSCode Problem Matcher)
   */
  formatForIDE() {
    const output = [];
    
    for (const error of this.errors) {
      if (error.file) {
        // VSCode problem matcher format
        output.push(`${error.file}:1:1: error: ${error.message}`);
      } else {
        output.push(`error: ${error.message}`);
      }
    }
    
    for (const warning of this.warnings) {
      if (warning.file) {
        output.push(`${warning.file}:1:1: warning: ${warning.message}`);
      } else {
        output.push(`warning: ${warning.message}`);
      }
    }
    
    return output.join('\n');
  }

  /**
   * Generate JSON report for tooling integration
   */
  generateJSONReport() {
    return {
      timestamp: new Date().toISOString(),
      filesChecked: this.checkedFiles,
      errors: this.errors,
      warnings: this.warnings,
      summary: {
        errorCount: this.errors.length,
        warningCount: this.warnings.length,
        passed: this.errors.length === 0,
      },
    };
  }

  /**
   * Print results to console
   */
  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log(`${colors.bold}📊 Convex Type Check Results${colors.reset}`);
    console.log('='.repeat(60));
    
    if (this.errors.length > 0) {
      console.log(`\n${colors.red}❌ Errors (${this.errors.length}):${colors.reset}`);
      for (const error of this.errors) {
        if (error.file) {
          console.log(`  ${colors.cyan}${error.file}${colors.reset}`);
        }
        console.log(`    ${colors.red}${error.type}:${colors.reset} ${error.message}`);
      }
    }
    
    if (this.warnings.length > 0) {
      console.log(`\n${colors.yellow}⚠️  Warnings (${this.warnings.length}):${colors.reset}`);
      for (const warning of this.warnings) {
        if (warning.file) {
          console.log(`  ${colors.cyan}${warning.file}${colors.reset}`);
        }
        console.log(`    ${colors.yellow}${warning.type}:${colors.reset} ${warning.message}`);
      }
    }
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log(`\n${colors.green}✅ All Convex type checks passed!${colors.reset}`);
      console.log(`   Files checked: ${this.checkedFiles}`);
    }
    
    console.log('\n' + '='.repeat(60));
  }

  /**
   * Main execution
   */
  async run() {
    try {
      // Run TypeScript type checking
      await this.runTypeScriptCheck();
      
      // Check Convex-specific patterns
      await this.checkConvexPatterns();
      
      // Output results
      this.printResults();
      
      // Write JSON report for IDE integration
      const reportPath = path.join(rootDir, '.convex-types-report.json');
      await fs.writeFile(
        reportPath,
        JSON.stringify(this.generateJSONReport(), null, 2)
      );
      
      // Output IDE-compatible format if requested
      if (process.env.IDE_FORMAT === 'true') {
        console.log('\n' + this.formatForIDE());
      }
      
      // Exit with appropriate code
      process.exit(this.errors.length > 0 ? 1 : 0);
    } catch (error) {
      console.error(`${colors.red}Fatal error:${colors.reset}`, error.message);
      process.exit(1);
    }
  }
}

// Run the checker
const checker = new ConvexTypeChecker();
checker.run();
