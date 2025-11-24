interface VariableValidationResult {
  isValid: boolean;
  errors: string[];
  missingColumns: string[];
  malformedVariables: string[];
}

interface VariableReplacement {
  userId: string;
  title: string;
  body: string;
  deepLink?: string;
}

// Extract variable names from text like [[var:column_name]]
export const extractVariables = (text: string): string[] => {
  const variableRegex = /\[\[var:([a-zA-Z_][a-zA-Z0-9_]*)\]\]/g;
  const variables: string[] = [];
  let match;
  
  while ((match = variableRegex.exec(text)) !== null) {
    variables.push(match[1]);
  }
  
  return variables;
};

// Validate variables against CSV data
export const validateVariables = (
  title: string,
  body: string,
  deepLink: string | undefined,
  csvData: any[]
): VariableValidationResult => {
  const result: VariableValidationResult = {
    isValid: true,
    errors: [],
    missingColumns: [],
    malformedVariables: []
  };

  if (csvData.length === 0) {
    result.isValid = false;
    result.errors.push('No CSV data provided for variable validation');
    return result;
  }

  const availableColumns = Object.keys(csvData[0]);
  const allText = [title, body, deepLink || ''].join(' ');
  
  // Check for malformed variables (only check for common typos, not structural issues)
  const malformedPatterns = [
    /\[\[vra:[a-zA-Z_][a-zA-Z0-9_]*\]\]/g, // Typo: vra instead of var
    /\[\[va:[a-zA-Z_][a-zA-Z0-9_]*\]\]/g,  // Typo: va instead of var
    /\[\[v:[a-zA-Z_][a-zA-Z0-9_]*\]\]/g,   // Typo: v instead of var
  ];

  malformedPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(allText)) !== null) {
      result.malformedVariables.push(match[0]);
    }
  });

  if (result.malformedVariables.length > 0) {
    result.isValid = false;
    result.errors.push(`Malformed variable syntax found: ${result.malformedVariables.join(', ')}`);
    result.errors.push('Variables must use the format: [[var:column_name]]');
  }

  // Extract valid variables from all fields
  const titleVars = extractVariables(title);
  const bodyVars = extractVariables(body);
  const deepLinkVars = deepLink ? extractVariables(deepLink) : [];
  const allVariables = [...new Set([...titleVars, ...bodyVars, ...deepLinkVars])];

  // Check if all variables exist as columns in CSV
  allVariables.forEach(variable => {
    if (!availableColumns.includes(variable)) {
      result.missingColumns.push(variable);
    }
  });

  if (result.missingColumns.length > 0) {
    result.isValid = false;
    result.errors.push(`Missing columns in CSV: ${result.missingColumns.join(', ')}`);
  }

  return result;
};

// Replace variables in text with actual values
export const replaceVariables = (text: string, userData: Record<string, any>): string => {
  return text.replace(/\[\[var:([a-zA-Z_][a-zA-Z0-9_]*)\]\]/g, (match, varName) => {
    const value = userData[varName];
    // Return the original placeholder if the value is null or undefined,
    // so it can be caught by the filter.
    return value !== undefined && value !== null ? String(value) : match;
  });
};

// Process all variable replacements for a batch of users
export const processVariableReplacements = (
  title: string,
  body: string,
  deepLink: string | undefined,
  csvData: any[]
): VariableReplacement[] => {
  return csvData.map(userData => {
    const titleReplaced = replaceVariables(title, userData);
    const bodyReplaced = replaceVariables(body, userData);
    const deepLinkReplaced = deepLink ? replaceVariables(deepLink, userData) : undefined;

    return {
      userId: userData.user_id || userData.userId,
      title: titleReplaced,
      body: bodyReplaced,
      deepLink: deepLinkReplaced,
    };
  }).filter(replacement => {
    const combinedText = [replacement.title, replacement.body, replacement.deepLink || ''].join('');
    // Filter out any message that still contains a variable placeholder
    return !/\[\[var:([a-zA-Z_][a-zA-Z0-9_]*)\]\]/.test(combinedText);
  });
}; 