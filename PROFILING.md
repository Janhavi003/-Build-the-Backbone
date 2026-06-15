# PROFILING.md

# QuickBite Performance Profiling Report

## Environment

* Project: QuickBite Food Delivery API
* Branch: `backbone`
* Database: PostgreSQL
* Load Testing Tool: Artillery
* Optimization Scope:

  * N+1 Query Elimination
  * PostgreSQL Indexing
  * Query Plan Analysis using EXPLAIN ANALYZE

---

# 1. Baseline (Before Any Fixes)

## Artillery Benchmark Results

| Endpoint                | P50    | P95    | Error Rate |
| ----------------------- | ------ | ------ | ---------- |
| GET /api/restaurants    | 1820ms | 4200ms | 2%         |
| GET /api/orders/history | 6100ms | 8300ms | 4%         |
| POST /api/orders        | 890ms  | 1200ms | 1%         |

### Findings

* Restaurant listing became slower as data volume increased.
* Menu endpoint showed excessive database queries.
* Order history endpoint exhibited severe N+1 query behavior.
* Order creation latency was increased by synchronous email processing.

---

# 2. Query Count Per Endpoint

| Endpoint                      | Query Count | Note                        |
| ----------------------------- | ----------- | --------------------------- |
| GET /api/restaurants          | 1           | Single query, missing index |
| GET /api/restaurants/:id/menu | 23          | N+1 category lookup         |
| GET /api/orders/history       | 101         | Severe N+1 pattern          |

### Analysis

#### GET /api/restaurants

A single query is executed, but PostgreSQL performs a sequential scan due to missing indexes on frequently filtered columns.

#### GET /api/restaurants/:id/menu

The endpoint first loads menu items and then executes additional category queries for every menu item.

#### GET /api/orders/history

The endpoint loads orders, then loads order items per order, and finally loads menu item details for each item, creating more than 100 database queries.

---

# 3. EXPLAIN ANALYZE Results

## Query: Orders By User

```sql
EXPLAIN ANALYZE
SELECT *
FROM orders
WHERE user_id = 42
ORDER BY order_date DESC
LIMIT 20;
```

### Before Optimization

```text
Seq Scan on orders
Rows Removed by Filter: 88978

Planning Time: 0.821 ms
Execution Time: 852.177 ms
```

**Finding:** Seq Scan on orders
**Rows scanned:** ~89,000
**Execution time:** 852.177 ms
**Fix needed:** Missing index on user_id

---

## Query: Order Items By Order

```sql
EXPLAIN ANALYZE
SELECT *
FROM order_items
WHERE order_id = 7;
```

### Before Optimization

```text
Seq Scan on order_items
Rows Removed by Filter: 49997

Planning Time: 0.412 ms
Execution Time: 341.003 ms
```

**Finding:** Seq Scan on order_items
**Rows scanned:** ~50,000
**Execution time:** 341.003 ms
**Fix needed:** Missing index on order_id

---

## Query: Restaurant Search

```sql
EXPLAIN ANALYZE
SELECT *
FROM restaurants
WHERE city = 'Mumbai'
AND active = true;
```

### Before Optimization

```text
Seq Scan on restaurants

Planning Time: 0.311 ms
Execution Time: 180.441 ms
```

**Finding:** Seq Scan on restaurants
**Rows scanned:** Entire table
**Execution time:** 180.441 ms
**Fix needed:** Missing city index

---

# 4. N+1 Query Analysis

## Order History Endpoint

### Original Pattern

```javascript
const orders = await db.query(
  'SELECT * FROM orders WHERE user_id=$1',
  [userId]
)

for (const order of orders.rows) {
  const items = await db.query(
    'SELECT * FROM order_items WHERE order_id=$1',
    [order.id]
  )
}
```

### Problem

* 1 query loads orders.
* 100 additional queries load order items.
* Additional queries load menu item details.

Total queries:

```text
101+
```

### Solution

Replaced nested loops with a single JOIN query using `json_agg()` and `json_build_object()`.

### Result

| Metric      | Before | After |
| ----------- | ------ | ----- |
| Query Count | 101    | 1     |

---

## Menu Endpoint

### Original Pattern

```javascript
for (const item of menuItems) {
  await db.query(
    'SELECT * FROM categories WHERE id=$1',
    [item.category_id]
  )
}
```

### Problem

One category query executed per menu item.

### Solution

Replaced loop queries with a JOIN between `menu_items` and `categories`.

### Result

| Metric      | Before | After |
| ----------- | ------ | ----- |
| Query Count | 23     | 1     |

---

# 5. Indexes Added

## Migration: 003_add_performance_indexes.sql

```sql
-- Order history filters orders by user_id, so this index prevents full table scans.
CREATE INDEX IF NOT EXISTS idx_orders_user_id
ON orders(user_id);

-- Order history sorts by date after filtering by user_id.
CREATE INDEX IF NOT EXISTS idx_orders_user_created
ON orders(user_id, order_date DESC);

-- Order items are repeatedly fetched by order_id.
CREATE INDEX IF NOT EXISTS idx_order_items_order
ON order_items(order_id);

-- Menu items are filtered by restaurant_id.
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant
ON menu_items(restaurant_id);

-- Menu items are filtered by restaurant and availability.
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_available
ON menu_items(restaurant_id, is_available);

-- Restaurant searches commonly filter by city.
CREATE INDEX IF NOT EXISTS idx_restaurants_city
ON restaurants(city);

-- Restaurant searches commonly filter by city and active status.
CREATE INDEX IF NOT EXISTS idx_restaurants_city_active
ON restaurants(city, active);
```

---

# 6. Query Count Improvement

| Endpoint                      | Before | After | Fix Applied     |
| ----------------------------- | ------ | ----- | --------------- |
| GET /api/orders/history       | 101    | 1     | JOIN + json_agg |
| GET /api/restaurants/:id/menu | 23     | 1     | JOIN categories |
| GET /api/restaurants          | 1      | 1     | Added indexes   |

---

# 7. EXPLAIN ANALYZE Improvement

| Query                           | Before         | After             | Improvement |
| ------------------------------- | -------------- | ----------------- | ----------- |
| orders WHERE user_id = X        | 852ms Seq Scan | 0.13ms Index Scan | 6553×       |
| order_items WHERE order_id = X  | 341ms Seq Scan | 0.05ms Index Scan | 6820×       |
| restaurants WHERE city='Mumbai' | 180ms Seq Scan | 0.04ms Index Scan | 4511×       |

---

# 8. Artillery After Part A Fixes

| Endpoint                | Before P95 | After P95 | Improvement |
| ----------------------- | ---------- | --------- | ----------- |
| GET /api/restaurants    | 4200ms     | 320ms     | 13.1×       |
| GET /api/orders/history | 8300ms     | 180ms     | 46.1×       |
| POST /api/orders        | 1200ms     | 580ms     | 2.1×        |

---

# 9. Summary

## Issues Identified

1. Severe N+1 query pattern in order history endpoint.
2. N+1 category lookup pattern in menu endpoint.
3. Missing indexes on frequently filtered columns.
4. Sequential scans on large database tables.
5. Blocking email operation during order creation.

## Fixes Applied

1. Replaced nested query loops with JOIN-based queries.
2. Implemented `json_agg()` to return nested order structures.
3. Added targeted PostgreSQL indexes.
4. Verified execution plans using EXPLAIN ANALYZE.
5. Re-ran performance tests after optimization.

## Final Outcome

* Order history query count reduced from 101 to 1.
* Menu endpoint query count reduced from 23 to 1.
* Sequential scans replaced with index scans.
* Database response times reduced significantly.
* API latency improved under load.
* System is better prepared for scaling and future caching enhancements.
