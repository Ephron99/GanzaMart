import { body, param, query } from 'express-validator';

// POST/PUT bodies arrive either as JSON or as multipart/form-data (when the admin
// attaches image files, HTML forms send every field as a string). These rules
// therefore coerce strings to numbers instead of rejecting them.
const MONEY = { gt: 0, max: 99999999.99 };

export const createProductRules = [
  body('name').isString().trim().isLength({ min: 2, max: 160 })
    .withMessage('Product name must be 2–160 characters.'),
  body('description').isString().trim().isLength({ min: 10, max: 20000 })
    .withMessage('Description must be at least 10 characters.'),
  body('categoryId').isInt({ min: 1 }).withMessage('A valid category is required.').toInt(),
  body('price').isFloat(MONEY).withMessage('Price must be greater than 0.').toFloat(),
  body('discountPrice')
    .optional({ values: 'falsy' })
    .isFloat(MONEY).withMessage('Discount price must be greater than 0.').toFloat(),
  body('stock').optional().isInt({ min: 0, max: 1000000 })
    .withMessage('Stock must be a whole number from 0 to 1,000,000.').toInt(),
  body('lowStockThreshold').optional().isInt({ min: 0, max: 1000 })
    .withMessage('Low-stock alert must be 0–1000.').toInt(),
  body('sku').optional({ values: 'falsy' }).trim().isLength({ min: 3, max: 40 })
    .withMessage('SKU must be 3–40 characters.'),
  body('imageUrl').optional({ values: 'falsy' }).trim().isLength({ max: 255 })
    .withMessage('Image URL is too long.'),
  body('slug').optional({ values: 'falsy' }).trim().matches(/^[a-z0-9-]+$/i)
    .withMessage('Slug may only contain letters, numbers and dashes.'),
  body('isFeatured').optional().isBoolean().withMessage('isFeatured must be true or false.').toBoolean(),
  body('isNewArrival').optional().isBoolean().withMessage('isNewArrival must be true or false.').toBoolean(),
  // Never accept server-controlled state from the client.
  body('id').not().exists().withMessage('Unexpected field: id.'),
  body('created_at').not().exists().withMessage('Unexpected field.'),
];

// PUT replaces the whole resource, so it uses the same rules as POST.
export const updateProductRules = createProductRules;

export const productParamRules = [
  param('id').isInt({ min: 1 }).withMessage('Product id must be a positive integer.').toInt(),
];

export const imageParamRules = [
  ...productParamRules,
  param('imageId').isInt({ min: 1 }).withMessage('Image id must be a positive integer.').toInt(),
];

export const stockRules = [
  param('id').isInt({ min: 1 }).withMessage('Product id must be a positive integer.').toInt(),
  body('stock').exists().withMessage('stock is required.')
    .isInt({ min: 0, max: 1000000 }).withMessage('Stock must be a whole number from 0 to 1,000,000.').toInt(),
];

export const productQueryRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be ≥ 1.').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1–100.').toInt(),
  query('minPrice').optional().isFloat({ min: 0 }).withMessage('minPrice must be ≥ 0.').toFloat(),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('maxPrice must be ≥ 0.').toFloat(),
  query('sort').optional().isString().trim().isLength({ max: 20 }).withMessage('Unknown sort.'),
  query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('Search text is too long.'),
  query('category').optional().isString().trim().matches(/^[a-z0-9-]+$/i).withMessage('Unknown category slug.'),
  query('categoryId').optional().isInt({ min: 1 }).withMessage('categoryId must be an integer.').toInt(),
];

export const createCategoryRules = [
  body('name').isString().trim().isLength({ min: 2, max: 80 })
    .withMessage('Category name must be 2–80 characters.'),
  body('slug').optional({ values: 'falsy' }).trim().matches(/^[a-z0-9-]+$/i)
    .withMessage('Slug may only contain letters, numbers and dashes.'),
  body('parentId').optional({ values: 'falsy' }).isInt({ min: 1 })
    .withMessage('Parent category must be a positive integer.').toInt(),
  body('imageUrl').optional({ values: 'falsy' }).trim().isLength({ max: 255 })
    .withMessage('Image URL is too long.'),
  body('id').not().exists().withMessage('Unexpected field: id.'),
];

export const updateCategoryRules = createCategoryRules;

export const categoryParamRules = [
  // Accepts either a numeric id or a slug — /api/categories/1 and /api/categories/electronics.
  param('idOrSlug').custom((v) => /^(?:\d+|[a-z0-9-]+)$/i.test(String(v)))
    .withMessage('Category identifier must be an id or a slug.'),
];
