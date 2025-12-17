// src/lib/generators/CsvGenerator.ts

import * as fs from 'fs';
import * as path from 'path';
import { format } from 'fast-csv';

export class CsvGenerator {
  /**
   * Write records to CSV file using streaming for memory efficiency
   * Includes proper cleanup on errors to prevent file handle leaks
   */
  async writeRecords<T extends Record<string, unknown>>(
    filePath: string,
    records: T[],
    columns: readonly string[]
  ): Promise<void> {
    // Ensure output directory exists
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);
      const csvStream = format({ headers: columns as string[] });

      let streamClosed = false;

      const cleanup = () => {
        if (!streamClosed) {
          streamClosed = true;
          csvStream.end();
          writeStream.end();
        }
      };

      writeStream.on('finish', () => {
        cleanup();
        resolve();
      });

      writeStream.on('error', (err) => {
        cleanup();
        reject(new Error(`Write stream error for ${filePath}: ${err.message}`));
      });

      csvStream.on('error', (err) => {
        cleanup();
        reject(new Error(`CSV stream error for ${filePath}: ${err.message}`));
      });

      csvStream.pipe(writeStream);

      try {
        for (const record of records) {
          // Extract only specified columns in order
          const row = columns.reduce((acc, col) => {
            acc[col] = record[col] ?? '';
            return acc;
          }, {} as Record<string, unknown>);

          csvStream.write(row);
        }

        csvStream.end();
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }
}
