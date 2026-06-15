
const redis = require('../lib/redis');

/**
 * Redis-backed fixed window rate limiter
 */
const rateLimiter = ({ maxRequests, windowMs, keyFn }) => {
    return async (req, res, next) => {
        const key = `ratelimit:${keyFn(req)}`;
        const windowSec = Math.ceil(windowMs / 1000);

        try {
            const current = await redis.incr(key);

            if (current === 1) {
                await redis.expire(key, windowSec);
            }

            const ttl = await redis.ttl(key);

            res.set('X-RateLimit-Limit', maxRequests);
            res.set(
                'X-RateLimit-Remaining',
                Math.max(0, maxRequests - current)
            );
            res.set(
                'X-RateLimit-Reset',
                new Date(
                    Date.now() + ttl * 1000
                ).toISOString()
            );

            if (current > maxRequests) {
                res.set('Retry-After', ttl);

                return res.status(429).json({
                    error: 'RATE_LIMIT_EXCEEDED',
                    message:
                        `You have exceeded ${maxRequests} requests per minute on this endpoint.`,
                    retryAfter: ttl
                });
            }

            next();

        } catch (err) {
            console.error(
                '[RateLimit] Redis error, allowing request:',
                err.message
            );

            // Fail open
            next();
        }
    };
};

module.exports = rateLimiter;
