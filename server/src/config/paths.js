// Single definition of "where uploaded files live".
// The uploader, the static handler in app.js and the delete-cleanup helper all
// import from here, so the path can never drift between them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// server/uploads — created as soon as this module loads, so the first upload of a
// fresh clone never fails on a missing directory.
export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
// Public URL prefix those files are served under.
export const UPLOAD_URL_PREFIX = '/uploads';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
