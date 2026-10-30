// Read-side business rules for product reviews (spec §3C: "product rating and
// reviews" on the details page).
import { ApiError } from '../utils/ApiError.js';
import * as productModel from '../models/productModel.js';
import * as reviewModel from '../models/reviewModel.js';

export async function getProductReviews(productId, { page = 1, limit = 10 } = {}) {
  // Validating the product first means /api/products/999999/reviews is a 404,
  // not an empty 200 that the UI would have to special-case.
  const product = await productModel.findProductById(Number(productId), {});
  if (!product) throw new ApiError(404, 'Product not found.');

  const take = Math.min(Math.max(Math.trunc(Number(limit)) || 10, 1), 50);
  const current = Math.max(Math.trunc(Number(page)) || 1, 1);

  const [rows, total, rawBreakdown] = await Promise.all([
    reviewModel.listProductReviews(product.id, { limit: take, offset: (current - 1) * take }),
    reviewModel.countProductReviews(product.id),
    reviewModel.reviewBreakdown(product.id),
  ]);

  // Average is derived from the histogram, so the headline number and the bars
  // underneath it can never disagree (the classic "4.7 but five 5-star reviews" bug).
  const sum = rawBreakdown.reduce((acc, b) => acc + b.rating * b.count, 0);

  // Always five rows, oldest star last, missing stars filled with 0 — the client
  // renders the list as-is without inventing structure.
  const breakdown = [5, 4, 3, 2, 1].map((star) => ({
    rating: star,
    count: rawBreakdown.find((b) => b.rating === star)?.count ?? 0,
  }));

  return {
    product: { id: product.id, name: product.name, slug: product.slug },
    average: total === 0 ? null : Number((sum / total).toFixed(1)),
    total,
    breakdown,
    reviews: rows.map((r) => ({
      id: r.id,
      rating: Number(r.rating),
      title: r.title,
      comment: r.comment,
      author: r.user_name,
      // Spec §6 review rule: only a customer with a real order may review. Rather
      // than hide that rule in the database, the API states it on every row so the
      // page can show a "Verified buyer" chip.
      verifiedPurchase: Boolean(r.verified_purchase),
      createdAt: r.created_at,
    })),
    pagination: { total, page: current, limit: take, pages: Math.ceil(total / take) || 1 },
  };
}
