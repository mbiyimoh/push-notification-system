import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

/**
 * API endpoint that executes database queries via our established Python sql_utils infrastructure
 * This bridges the Next.js frontend with our proven database access patterns
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, params = [] } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Query is required and must be a string' },
        { status: 400 }
      );
    }

    // Create a temporary Python script that uses our established sql_utils
    const pythonScript = `
import sys
import os
import json

# The PYTHONPATH is now set in the spawn command's environment, so we don't need to manipulate the path here.

try:
    from basic_capabilities.internal_db_queries_toolbox.sql_utils import execute_query
    
    # Get query and params from command line arguments
    query = sys.argv[1]
    params_json = sys.argv[2] if len(sys.argv) > 2 else '[]'
    params = json.loads(params_json)
    
    # Execute the query using our established infrastructure
    result = execute_query(query, params if params else None)
    
    if result is None:
        print(json.dumps({"error": "Query execution failed"}))
        sys.exit(1)
    
    # Convert result to JSON-serializable format
    json_result = []
    for row in result:
        if hasattr(row, '_asdict'):
            # Handle named tuples
            json_result.append(row._asdict())
        elif hasattr(row, 'keys'):
            # Handle dict-like objects
            json_result.append(dict(row))
        else:
            # Handle regular tuples/lists
            json_result.append(row)
    
    print(json.dumps({"data": json_result}))
    
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
`;

    // Execute the Python script
    const result = await new Promise<{success: boolean, data?: any[], error?: string}>((resolve, reject) => {
      const python = spawn('python3', ['-c', pythonScript, query, JSON.stringify(params)], {
        cwd: process.cwd(), // Execute from the monorepo root
        env: {
          ...process.env,
          PYTHONPATH: process.cwd(),
        }
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error('Python script error:', stderr);
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const jsonResult = JSON.parse(stdout.trim());
          if (jsonResult.error) {
            reject(new Error(jsonResult.error));
          } else {
            resolve(jsonResult);
          }
        } catch (parseError) {
          console.error('Failed to parse Python output:', stdout);
          reject(new Error(`Failed to parse Python output: ${parseError}`));
        }
      });
    });

    return NextResponse.json({
      success: true,
      data: result.data
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      }
    });

  } catch (error: unknown) {
    console.error('Error in execute-query API:', error);
    const errorMessage = error instanceof Error ? error.message : 'An internal server error occurred';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined
      },
      { status: 500 }
    );
  }
} 