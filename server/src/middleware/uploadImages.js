// Product image uploads: strict validation, server-controlled file names.
import multer from 'multer';
import crypto from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';
import { UPLOAD_DIR, UPLOAD_URL_PREFIX } from '../config/paths.js';

// Extension is derived from the MIME type we accept — never from the client's
// file name, which could be "shell.php.png" or contain path separators.
const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/avif', '.avif'],
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ALLOWED.get(file.mimetype)}`),
});

const uploader = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 6, fieldNameSize: 40, fieldSize: 200 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) return cb(null, true);
    cb(new ApiError(422, `Unsupported image type "${file.mimetype}". Use JPEG, PNG, WebP or AVIF.`));
  },
});

// Accepts multipart/form-data with an optional `images` file field.
// Populates req.uploadedImageUrls (public URL path per stored file) and turns any
// multer error into our standard JSON error shape.
export const uploadProductImages = (req, res, next) => {
  const middleware = uploader.array('images', 6);

  middleware(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        const message = err.code === 'LIMIT_FILE_SIZE'
          ? 'Each image must be 2 MB or smaller.'
          : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
            ? 'Too many files (maximum 6) or an unexpected field name.'
            : err.message;
        return next(new ApiError(err.code === 'LIMIT_FILE_SIZE' ? 413 : 422, message));
      }
      return next(err);
    }

    req.uploadedImageUrls = (req.files ?? []).map((f) => `${UPLOAD_URL_PREFIX}/${f.filename}`);
    next();
  });
};
