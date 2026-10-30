-- ============================================================================
-- Ganza Mart — MySQL schema (Phase 2)
-- Target: MySQL 8.0.x (verified installed: MySQL80 service, port 3306)
-- Run in MySQL Workbench, or:  mysql -u root -p -P 3306 < schema.sql
-- ============================================================================

DROP DATABASE IF EXISTS GanzaMart_db;
CREATE DATABASE GanzaMart_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE GanzaMart_db;

-- ----------------------------------------------------------------------------
-- 1. users — customer and administrator accounts
--    Passwords are bcrypt(12) hashes produced by server/tools/hash-seed-passwords.mjs
--    Never plaintext. is_active lets admin deactivate without deleting history.
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id            INT UNSIGNED         NOT NULL AUTO_INCREMENT,
  full_name     VARCHAR(100)         NOT NULL,
  email         VARCHAR(191)         NOT NULL,
  phone         VARCHAR(20)          NULL,
  password_hash VARCHAR(60)          NOT NULL,
  role          ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  is_active     TINYINT(1)           NOT NULL DEFAULT 1,
  -- token_version makes JWT revocation possible: logout / deactivation bumps it, and
  -- every earlier token (carrying the old number) stops being accepted.
  token_version INT UNSIGNED         NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB;

-- 2. addresses — customer delivery addresses (soft delete keeps order history valid)
CREATE TABLE addresses (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED  NOT NULL,
  label        VARCHAR(50)   NOT NULL DEFAULT 'Home',
  recipient    VARCHAR(100)  NOT NULL,
  phone        VARCHAR(20)   NOT NULL,
  line1        VARCHAR(150)  NOT NULL,
  line2        VARCHAR(150)  NULL,
  city         VARCHAR(80)   NOT NULL,
  province     VARCHAR(80)   NULL,
  postal_code  VARCHAR(20)   NULL,
  country      VARCHAR(60)   NOT NULL DEFAULT 'Rwanda',
  is_default   TINYINT(1)    NOT NULL DEFAULT 0,
  deleted_at   DATETIME      NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_addresses_user (user_id),
  CONSTRAINT fk_addresses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3. categories — self-referencing parent_id allows sub-categories
CREATE TABLE categories (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  parent_id  INT UNSIGNED  NULL,
  name       VARCHAR(80)   NOT NULL,
  slug       VARCHAR(100)  NOT NULL,
  image_url  VARCHAR(255)  NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_slug (slug),
  KEY idx_categories_parent (parent_id),
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 4. products — catalog, prices (DECIMAL, never FLOAT) and inventory
--    Average rating is NOT stored here (MySQL forbids subqueries in generated columns);
--    the API computes it with an aggregate LEFT JOIN on reviews — always accurate, zero sync bugs.
CREATE TABLE products (
  id             INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  category_id    INT UNSIGNED   NOT NULL,
  name           VARCHAR(160)   NOT NULL,
  slug           VARCHAR(180)   NOT NULL,
  description    TEXT           NOT NULL,
  price          DECIMAL(10,2)  NOT NULL,
  discount_price DECIMAL(10,2)  NULL,
  stock          INT            NOT NULL DEFAULT 0,
  low_stock_threshold INT       NOT NULL DEFAULT 5,
  sku            VARCHAR(40)    NULL,
  image_url      VARCHAR(255)   NOT NULL DEFAULT '/images/products/placeholder.svg',
  is_featured    TINYINT(1)     NOT NULL DEFAULT 0,
  is_new_arrival TINYINT(1)     NOT NULL DEFAULT 0,
  is_archived    TINYINT(1)     NOT NULL DEFAULT 0,   -- soft delete: orders keep referencing products
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_slug (slug),
  KEY idx_products_category (category_id),
  KEY idx_products_price (price),
  KEY idx_products_featured (is_featured),
  KEY idx_products_new (is_new_arrival),
  KEY idx_products_created (created_at),
  KEY idx_products_stock (stock),
  FULLTEXT KEY ft_products_search (name, description),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT chk_products_price     CHECK (price > 0),
  CONSTRAINT chk_products_discount  CHECK (discount_price IS NULL OR (discount_price > 0 AND discount_price < price)),
  CONSTRAINT chk_products_stock     CHECK (stock >= 0)
) ENGINE=InnoDB;

-- 5. product_images — additional gallery images
CREATE TABLE product_images (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED  NOT NULL,
  image_url  VARCHAR(255)  NOT NULL,
  alt_text   VARCHAR(150)  NULL,
  sort_order INT           NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_product_images_product (product_id),
  CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 6. carts — one row per customer OR per anonymous browser session.
--    On login the service layer merges the session cart into the user cart.
CREATE TABLE carts (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED  NULL,
  session_token VARCHAR(64)   NULL,
  coupon_code   VARCHAR(40)   NULL,          -- staging area for checkout: applied coupon
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_carts_user (user_id),        -- one persistent cart per user
  UNIQUE KEY uq_carts_session (session_token),
  CONSTRAINT fk_carts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 7. cart_items — price is NEVER stored here; it is always read from products (server-side truth)
CREATE TABLE cart_items (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cart_id    INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity   INT          NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cart_items (cart_id, product_id),
  KEY idx_cart_items_product (product_id),
  CONSTRAINT fk_cart_items_cart    FOREIGN KEY (cart_id)    REFERENCES carts(id)    ON DELETE CASCADE,
  CONSTRAINT fk_cart_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT chk_cart_qty CHECK (quantity >= 1)
) ENGINE=InnoDB;

-- 8. orders — financial snapshot columns; later price changes never rewrite history
--    order_number is a human-friendly code (e.g. GM000000000042) written by the order
--    service right after INSERT (generated columns may not reference AUTO_INCREMENT id).
CREATE TABLE orders (
  id             INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  order_number   VARCHAR(20)    NOT NULL,
  user_id        INT UNSIGNED   NOT NULL,
  status         ENUM('pending','confirmed','processing','shipped','delivered','cancelled','refunded')
                 NOT NULL DEFAULT 'pending',
  subtotal       DECIMAL(10,2)  NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  shipping_fee   DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  total_amount   DECIMAL(10,2)  NOT NULL,
  coupon_code    VARCHAR(40)    NULL,
  payment_method ENUM('cod','mock') NOT NULL DEFAULT 'cod',
  -- delivery address snapshot (copied at checkout; address edits don't alter past orders)
  recipient      VARCHAR(100)   NOT NULL,
  contact_phone  VARCHAR(20)    NOT NULL,
  address_line1  VARCHAR(150)   NOT NULL,
  address_line2  VARCHAR(150)   NULL,
  city           VARCHAR(80)    NOT NULL,
  province       VARCHAR(80)    NULL,
  postal_code    VARCHAR(20)    NULL,
  country        VARCHAR(60)    NOT NULL DEFAULT 'Rwanda',
  notes          TEXT           NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_number (order_number),
  KEY idx_orders_user (user_id),
  KEY idx_orders_status (status),
  KEY idx_orders_created (created_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- 9. order_items — historical price + quantity locked at purchase time
CREATE TABLE order_items (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  order_id          INT UNSIGNED  NOT NULL,
  product_id        INT UNSIGNED  NOT NULL,
  product_name      VARCHAR(160)  NOT NULL,        -- name snapshot too
  price_at_purchase DECIMAL(10,2) NOT NULL,
  quantity          INT           NOT NULL,
  line_total        DECIMAL(10,2) GENERATED ALWAYS AS (price_at_purchase * quantity) STORED,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id),
  KEY idx_order_items_product (product_id),
  CONSTRAINT fk_order_items_order   FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT chk_order_qty CHECK (quantity >= 1)
) ENGINE=InnoDB;

-- 10. payments — method, status, provider reference. NO card data, ever.
CREATE TABLE payments (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  order_id     INT UNSIGNED  NOT NULL,
  method       ENUM('cod','mock') NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  currency     CHAR(3)       NOT NULL DEFAULT 'RWF',
  status       ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  provider_ref VARCHAR(100)  NULL,
  paid_at      DATETIME      NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payments_order (order_id),
  KEY idx_payments_status (status),
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 11. shipments — carrier and tracking details
CREATE TABLE shipments (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  order_id        INT UNSIGNED  NOT NULL,
  carrier         VARCHAR(80)   NULL,
  tracking_number VARCHAR(80)   NULL,
  shipped_at      DATETIME      NULL,
  delivered_at    DATETIME      NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shipments_order (order_id),
  CONSTRAINT fk_shipments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 12. reviews — only purchasers may review (enforced in service layer via order_items)
CREATE TABLE reviews (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  rating     TINYINT UNSIGNED NOT NULL,
  title      VARCHAR(120) NULL,
  comment    TEXT         NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reviews_product_user (product_id, user_id),
  KEY idx_reviews_product (product_id),
  CONSTRAINT fk_reviews_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

-- 13. coupons — discount codes with validity window and usage caps
CREATE TABLE coupons (
  id         INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  code       VARCHAR(40)    NOT NULL,
  type       ENUM('percent','fixed') NOT NULL,
  value      DECIMAL(10,2)  NOT NULL,
  min_order  DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  max_uses   INT            NULL,             -- NULL = unlimited
  used_count INT            NOT NULL DEFAULT 0,
  valid_from DATETIME       NOT NULL,
  valid_until DATETIME      NOT NULL,
  is_active  TINYINT(1)     NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupons_code (code),
  CONSTRAINT chk_coupon_value CHECK (
    (type = 'percent' AND value BETWEEN 1 AND 100) OR (type = 'fixed' AND value > 0)
  )
) ENGINE=InnoDB;

-- 14. coupon_redemptions — usage audit; user_id is copied from the order by the
--      service layer at checkout (subqueries are not allowed in generated columns),
--      which lets a UNIQUE index enforce one-redemption-per-customer per coupon in the DB itself.
CREATE TABLE coupon_redemptions (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  coupon_id  INT UNSIGNED NOT NULL,
  order_id   INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  discount_applied DECIMAL(10,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_redemptions_order (order_id),
  UNIQUE KEY uq_redemptions_coupon_user (coupon_id, user_id),
  CONSTRAINT fk_redemptions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id),
  CONSTRAINT fk_redemptions_order  FOREIGN KEY (order_id)  REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_redemptions_user   FOREIGN KEY (user_id)   REFERENCES users(id)
) ENGINE=InnoDB;

-- 15. wishlists — one per customer
CREATE TABLE wishlists (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wishlists_user (user_id),
  CONSTRAINT fk_wishlists_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 16. wishlist_items
CREATE TABLE wishlist_items (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  wishlist_id INT UNSIGNED NOT NULL,
  product_id  INT UNSIGNED NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wishlist_items (wishlist_id, product_id),
  CONSTRAINT fk_wishlist_items_wishlist FOREIGN KEY (wishlist_id) REFERENCES wishlists(id) ON DELETE CASCADE,
  CONSTRAINT fk_wishlist_items_product  FOREIGN KEY (product_id)  REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 17. newsletter_subscribers — footer signup (idempotent on email)
CREATE TABLE newsletter_subscribers (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  email      VARCHAR(191)  NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_newsletter_email (email)
) ENGINE=InnoDB;

-- 18. contact_messages — contact form submissions
CREATE TABLE contact_messages (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name       VARCHAR(100)  NOT NULL,
  email      VARCHAR(191)  NOT NULL,
  phone      VARCHAR(20)   NULL,
  subject    VARCHAR(150)  NOT NULL,
  message    TEXT          NOT NULL,
  is_handled TINYINT(1)    NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_contact_handled (is_handled)
) ENGINE=InnoDB;

-- 19. order_status_history — audit trail of every transition
CREATE TABLE order_status_history (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id    INT UNSIGNED NOT NULL,
  from_status ENUM('pending','confirmed','processing','shipped','delivered','cancelled','refunded') NULL,
  to_status   ENUM('pending','confirmed','processing','shipped','delivered','cancelled','refunded') NOT NULL,
  note        VARCHAR(255) NULL,
  changed_by  INT UNSIGNED NULL,               -- admin user who made the change
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_status_history_order (order_id),
  CONSTRAINT fk_status_history_order  FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_status_history_user   FOREIGN KEY (changed_by) REFERENCES users(id)
) ENGINE=InnoDB;
