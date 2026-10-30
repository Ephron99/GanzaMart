// Safe removal of files the API itself uploaded.
// Deleting rows from MySQL does not delete bytes from disk, so every permanent
// delete has to clean up after itself — but only ever its own files.
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR, UPLOAD_URL_PREFIX } from '../config/paths.js';
import { logger } from './logger.js';

const prefix = `${UPLOAD_URL_PREFIX}/`;

// Seeded artwork (/images/…) belongs to the React bundle and is never ours to delete.
export function isUploadedUrl(url) {
  return typeof url === 'string' && url.startsWith(prefix);
}

/**
 * Delete one uploaded file. Returns true when a file was removed.
 * Two guards matter: basename() discards any path traversal hidden in a stored
 * value ("../.env" becomes ".env"), and the resolved path is re-checked to stay
 * inside the uploads directory before anything is unlinked.
 */
export function deleteUploadedFile(url) {
  if (!isUploadedUrl(url)) return false;

  const target = path.join(UPLOAD_DIR, path.basename(url));
  if (!target.startsWith(UPLOAD_DIR + path.sep)) return false;

  fs.rmSync(target, { force: true });   // force: already-gone is not an error
  return true;
}

// Delete a list of URLs, ignoring failures, so one locked file cannot abort a
// product delete that the database has already committed.
export function deleteUploadedFiles(urls) {
  const removed = [];
  for (const url of new Set(urls.filter(isUploadedUrl))) {
    try {
      if (deleteUploadedFile(url)) removed.push(url);
    } catch (err) {
      // A Windows file lock (browser still previewing the image) must not turn a
      // successful product delete into a 500.
      logger.warn(`[uploads] could not delete ${url}: ${err.code || err.message}`);
    }
  }
  return removed;
}
