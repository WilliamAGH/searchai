/**
 * TypeScript Language Service Plugin for Convex
 * Provides real-time validation of Convex database types in the IDE
 * 
 * To use:
 * 1. Add to tsconfig.json:
 *    "plugins": [{ "name": "./scripts/convex-ts-plugin" }]
 * 2. Restart TypeScript service in VSCode
 */

function init(modules) {
  const ts = modules.typescript;

  /**
   * Convex-specific diagnostic codes
   */
  const DIAGNOSTIC_CODES = {
    MISSING_RETURNS: 90001,
    STRING_ID_USAGE: 90002,
    MANUAL_DOC_TYPE: 90003,
    MISSING_ARGS_VALIDATOR: 90004,
    INVALID_TABLE_NAME: 90005,
  };

  function create(info) {
    const proxy = Object.create(null);
    const oldLS = info.languageService;
    
    // Store schema information
    let schemaInfo = null;
    
    /**
     * Load schema information from convex/schema.ts
     */
    function loadSchemaInfo() {
      try {
        const schemaFile = info.project.getSourceFile('convex/schema.ts');
        if (schemaFile) {
          // Parse schema to extract table names
          const tableNames = [];
          ts.forEachChild(schemaFile, node => {
            if (ts.isCallExpression(node) && 
                node.expression.getText() === 'defineTable') {
              const parent = node.parent;
              if (ts.isPropertyAssignment(parent)) {
                tableNames.push(parent.name.getText());
              }
            }
          });
          schemaInfo = { tableNames };
        }
      } catch {
        // Schema not available yet
      }
    }
    
    // Load schema on initialization
    loadSchemaInfo();
    
    /**
     * Enhanced getSemanticDiagnostics with Convex-specific checks
     */
    proxy.getSemanticDiagnostics = (fileName) => {
      const prior = oldLS.getSemanticDiagnostics(fileName);
      
      // Skip non-Convex files
      if (!fileName.includes('/convex/') || fileName.includes('/_generated/')) {
        return prior;
      }
      
      const sourceFile = oldLS.getProgram().getSourceFile(fileName);
      if (!sourceFile) return prior;
      
      const additionalDiagnostics = [];
      
      /**
       * Check for Convex function patterns
       */
      function visitNode(node) {
        // Check for query/mutation/action definitions
        if (ts.isCallExpression(node)) {
          const expression = node.expression;
          if (ts.isIdentifier(expression)) {
            const name = expression.getText();
            if (['query', 'mutation', 'action'].includes(name)) {
              checkConvexFunction(node);
            }
          }
        }
        
        // Check for manual Doc type definitions
        if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
          checkForManualDocType(node);
        }
        
        // Check for string ID usage
        if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) {
          checkForStringId(node);
        }
        
        ts.forEachChild(node, visitNode);
      }
      
      /**
       * Check Convex function for proper validators
       */
      function checkConvexFunction(node) {
        const args = node.arguments[0];
        if (!args || !ts.isObjectLiteralExpression(args)) return;
        
        let hasArgs = false;
        let hasReturns = false;
        
        args.properties.forEach(prop => {
          if (ts.isPropertyAssignment(prop)) {
            const name = prop.name.getText();
            if (name === 'args') hasArgs = true;
            if (name === 'returns') hasReturns = true;
          }
        });
        
        // Check for missing returns validator
        if (!hasReturns) {
          additionalDiagnostics.push({
            file: sourceFile,
            start: node.getStart(),
            length: node.getWidth(),
            messageText: 'Convex functions should have a "returns" validator. Use v.null() for void returns.',
            category: ts.DiagnosticCategory.Warning,
            code: DIAGNOSTIC_CODES.MISSING_RETURNS,
          });
        }
        
        // Check for missing args validator
        if (!hasArgs) {
          additionalDiagnostics.push({
            file: sourceFile,
            start: node.getStart(),
            length: node.getWidth(),
            messageText: 'Convex functions should have an "args" validator. Use {} for no arguments.',
            category: ts.DiagnosticCategory.Warning,
            code: DIAGNOSTIC_CODES.MISSING_ARGS_VALIDATOR,
          });
        }
      }
      
      /**
       * Check for manual Doc type definitions
       */
      function checkForManualDocType(node) {
        const name = node.name.getText();
        const typeText = node.getText();
        
        // Check if it looks like a manual Doc type
        if (typeText.includes('_id:') && typeText.includes('_creationTime:')) {
          additionalDiagnostics.push({
            file: sourceFile,
            start: node.getStart(),
            length: node.getWidth(),
            messageText: `Manual Doc type detected. Use Doc<"${name}"> from convex/_generated/dataModel instead.`,
            category: ts.DiagnosticCategory.Error,
            code: DIAGNOSTIC_CODES.MANUAL_DOC_TYPE,
          });
        }
      }
      
      /**
       * Check for string ID usage
       */
      function checkForStringId(node) {
        if (!node.type) return;
        
        const name = node.name?.getText() || '';
        const typeText = node.type.getText();
        
        // Check if property name suggests it's an ID
        if ((name.endsWith('Id') || name === 'id' || name === '_id') && 
            typeText === 'string') {
          
          // Try to infer table name
          let tableName = 'TableName';
          if (name.includes('user')) tableName = 'users';
          else if (name.includes('chat')) tableName = 'chats';
          else if (name.includes('message')) tableName = 'messages';
          
          additionalDiagnostics.push({
            file: sourceFile,
            start: node.getStart(),
            length: node.getWidth(),
            messageText: `Use Id<"${tableName}"> instead of string for document IDs.`,
            category: ts.DiagnosticCategory.Warning,
            code: DIAGNOSTIC_CODES.STRING_ID_USAGE,
          });
        }
      }
      
      // Visit all nodes
      ts.forEachChild(sourceFile, visitNode);
      
      return [...prior, ...additionalDiagnostics];
    };
    
    /**
     * Enhanced getCompletionsAtPosition for Convex types
     */
    proxy.getCompletionsAtPosition = (fileName, position, options) => {
      const prior = oldLS.getCompletionsAtPosition(fileName, position, options);
      
      if (!prior || !fileName.includes('/convex/')) {
        return prior;
      }
      
      const sourceFile = oldLS.getProgram().getSourceFile(fileName);
      if (!sourceFile) return prior;
      
      // Get the token at position
      const token = ts.getTokenAtPosition(sourceFile, position);
      const parent = token.parent;
      
      // Add Convex-specific completions
      const additionalCompletions = [];
      
      // If typing after "v.", suggest Convex validators
      if (token.getText() === 'v' || 
          (parent && ts.isPropertyAccessExpression(parent) && 
           parent.expression.getText() === 'v')) {
        additionalCompletions.push(
          ...createValidatorCompletions()
        );
      }
      
      // If typing table name in v.id(), suggest actual table names
      if (parent && ts.isCallExpression(parent) && 
          parent.expression.getText() === 'v.id' && 
          schemaInfo?.tableNames) {
        additionalCompletions.push(
          ...schemaInfo.tableNames.map(table => ({
            name: `"${table}"`,
            kind: ts.ScriptElementKind.string,
            kindModifiers: '',
            sortText: '0',
            insertText: `"${table}"`,
          }))
        );
      }
      
      if (additionalCompletions.length > 0) {
        return {
          ...prior,
          entries: [...prior.entries, ...additionalCompletions],
        };
      }
      
      return prior;
    };
    
    /**
     * Create validator completions
     */
    function createValidatorCompletions() {
      return [
        { name: 'string()', insertText: 'string()', detail: 'String validator' },
        { name: 'number()', insertText: 'number()', detail: 'Number validator' },
        { name: 'boolean()', insertText: 'boolean()', detail: 'Boolean validator' },
        { name: 'null()', insertText: 'null()', detail: 'Null validator' },
        { name: 'id()', insertText: 'id("$1")', detail: 'Document ID validator' },
        { name: 'object()', insertText: 'object({$1})', detail: 'Object validator' },
        { name: 'array()', insertText: 'array($1)', detail: 'Array validator' },
        { name: 'optional()', insertText: 'optional($1)', detail: 'Optional validator' },
        { name: 'union()', insertText: 'union($1)', detail: 'Union validator' },
        { name: 'literal()', insertText: 'literal("$1")', detail: 'Literal validator' },
      ].map(item => ({
        name: item.name,
        kind: ts.ScriptElementKind.functionElement,
        kindModifiers: '',
        sortText: '0',
        insertText: item.insertText,
        labelDetails: { detail: item.detail },
      }));
    }
    
    // Proxy all other methods
    for (const key of Object.keys(oldLS)) {
      if (key in proxy) continue;
      proxy[key] = function(...args) {
        return oldLS[key](...args);
      };
    }
    
    return proxy;
  }

  return { create };
}

module.exports = init;
