
const redis = require('./redis');

const invalidateRestaurantCache = async (city) => {
    try {
        // Clear all cache keys for this city
        const keys = await redis.keys(
            `restaurants:city=${city}:*`
        );

        if (keys.length > 0) {
            await redis.del(...keys);
        }

        // Clear generic "all cities" cache
        const allKeys = await redis.keys(
            'restaurants:city=all:*'
        );

        if (allKeys.length > 0) {
            await redis.del(...allKeys);
        }

    } catch (err) {
        console.error(
            '[Cache] Invalidation failed (non-fatal):',
            err.message
        );
    }
};

module.exports = {
    invalidateRestaurantCache
};
