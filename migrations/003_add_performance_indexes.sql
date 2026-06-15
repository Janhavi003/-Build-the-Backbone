
-- 003_add_performance_indexes.sql

-- Order history filters orders by user_id, so this index prevents full table scans.
CREATE INDEX IF NOT EXISTS idx_orders_user_id
ON orders(user_id);

-- Order history sorts by created date after filtering by user_id.
CREATE INDEX IF NOT EXISTS idx_orders_user_created
ON orders(user_id, order_date DESC);

-- Order items are repeatedly fetched by order_id in order history queries.
CREATE INDEX IF NOT EXISTS idx_order_items_order
ON order_items(order_id);

-- Menu items are filtered by restaurant_id when loading restaurant menus.
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant
ON menu_items(restaurant_id);

-- Menu items are filtered by restaurant_id and availability status.
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_available
ON menu_items(restaurant_id, is_available);

-- Restaurant listing frequently filters restaurants by city.
CREATE INDEX IF NOT EXISTS idx_restaurants_city
ON restaurants(city);

-- Restaurant search commonly filters active restaurants within a city.
CREATE INDEX IF NOT EXISTS idx_restaurants_city_active
ON restaurants(city, active);
