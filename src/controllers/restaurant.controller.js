
const db = require('../db');
const redis = require('../lib/redis');

/**
 * Get List of Restaurants with filters.
 *
 * PART B FIX:
 * Redis Cache-Aside Pattern
 * - Check Redis first
 * - On cache miss, query DB and cache result
 * - TTL = 300 seconds (5 minutes)
 */
const getRestaurants = async (req, res) => {
    const {
        city,
        limit = 20,
        offset = 0,
        page = 1,
        sort = 'rating'
    } = req.query;

    const cacheKey =
        `restaurants:city=${city || 'all'}:page=${page}:limit=${limit}:sort=${sort}`;

    try {
        // Check cache first
        const cachedData = await redis.get(cacheKey);

        if (cachedData) {
            res.set('X-Cache', 'HIT');

            return res.json(JSON.parse(cachedData));
        }

        let queryStr = 'SELECT * FROM restaurants';
        const params = [];

        if (city) {
            queryStr += ' WHERE city = $1';
            params.push(city);

            queryStr += ' LIMIT $2 OFFSET $3';
            params.push(limit, offset);
        } else {
            queryStr += ' LIMIT $1 OFFSET $2';
            params.push(limit, offset);
        }

        const result = await db.query(queryStr, params);

        const responseData = {
            total: result.rowCount,
            restaurants: result.rows
        };

        // Store in cache for 5 minutes
        await redis.setex(
            cacheKey,
            300,
            JSON.stringify(responseData)
        );

        res.set('X-Cache', 'MISS');

        res.json(responseData);

    } catch (err) {
        console.error('[Cache] Error:', err.message);

        // Fallback to database if Redis is unavailable
        let queryStr = 'SELECT * FROM restaurants';
        const params = [];

        if (city) {
            queryStr += ' WHERE city = $1';
            params.push(city);

            queryStr += ' LIMIT $2 OFFSET $3';
            params.push(limit, offset);
        } else {
            queryStr += ' LIMIT $1 OFFSET $2';
            params.push(limit, offset);
        }

        const result = await db.query(queryStr, params);

        res.json({
            total: result.rowCount,
            restaurants: result.rows
        });
    }
};

/**
 * Get Restaurant Menu items with category details.
 *
 * PERFORMANCE FIX:
 * Replaced N+1 category lookup queries with a single JOIN query.
 */
const getMenu = async (req, res) => {
    const { id } = req.params;

    console.log(`[Restaurant Controller] Fetching menu for Restaurant #${id}`);

    try {
        const result = await db.query(
            `
            SELECT
                mi.id,
                mi.restaurant_id,
                mi.category_id,
                mi.name,
                mi.description,
                mi.price,
                mi.is_available,
                COALESCE(c.name, 'Uncategorized') AS category
            FROM menu_items mi
            LEFT JOIN categories c
                ON c.id = mi.category_id
            WHERE mi.restaurant_id = $1
              AND mi.is_available = TRUE
            ORDER BY mi.name
            `,
            [id]
        );

        res.json({
            restaurant_id: id,
            menu: result.rows
        });

    } catch (err) {
        console.error('Error fetching menu:', err);

        res.status(500).json({
            error: 'Failed to fetch menu'
        });
    }
};

const getHealth = async (req, res) => {
    try {
        await db.query('SELECT 1');

        res.json({
            status: 'UP',
            database: 'connected'
        });

    } catch (err) {
        res.status(503).json({
            status: 'DOWN',
            database: 'disconnected'
        });
    }
};

module.exports = {
    getRestaurants,
    getMenu,
    getHealth
};

