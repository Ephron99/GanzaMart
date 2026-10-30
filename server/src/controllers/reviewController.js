import * as reviewService from '../services/reviewService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/httpResponse.js';

// GET /api/products/:id/reviews?page=&limit=
export const listForProduct = asyncHandler(async (req, res) => {
  const bundle = await reviewService.getProductReviews(req.params.id, req.query);
  ok(res, bundle.reviews, {
    pagination: bundle.pagination,
    summary: { average: bundle.average, total: bundle.total, breakdown: bundle.breakdown },
    product: bundle.product,
  });
});
