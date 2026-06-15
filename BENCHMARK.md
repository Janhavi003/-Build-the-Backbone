# Before vs After Benchmark

## Test Conditions

* Tool: Artillery, 10 users/second, 60 seconds
* Same config: artillery-baseline.yml (unchanged)
* Environment: Windows 11, Local PostgreSQL + Redis
* Seed data: 100 restaurants, 10,000 orders, 50,000 order_items

---

## Results

| Metric                              | Before (Part A end) | After (Part B) | Improvement |
| ----------------------------------- | ------------------: | -------------: | ----------: |
| GET /restaurants - P50              |               180ms |            8ms |       22.5× |
| GET /restaurants - P95              |               320ms |           12ms |       26.7× |
| GET /orders/history - P50           |                95ms |           92ms |       1.03× |
| GET /orders/history - P95           |               180ms |          175ms |       1.03× |
| POST /orders - P50                  |               280ms |           62ms |        4.5× |
| POST /orders - P95                  |               580ms |          118ms |        4.9× |
| DB queries per /restaurants request |                   1 |  0 (Cache HIT) |           ∞ |
| Error rate                          |                1.2% |           0.2% |          6× |

---

## Cache Verification

### First Request

```http
GET /api/restaurants
X-Cache: MISS
```

* Redis cache miss
* Data fetched from PostgreSQL
* Response stored in Redis for 300 seconds

### Second Request

```http
GET /api/restaurants
X-Cache: HIT
```

* Response served directly from Redis
* No database query executed

---

## Rate Limiter Verification

Configured limit:

```text
10 requests per minute per authenticated user
```

Observed behavior:

| Request Number | Status                |
| -------------- | --------------------- |
| 1–10           | 201 Created           |
| 11             | 429 Too Many Requests |
| 12             | 429 Too Many Requests |

Returned headers:

```http
Retry-After: 60
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
```

Returned body:

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many order requests. Please try again later.",
  "retryAfter": 60
}
```

---

## Queue Verification

### Before

Order creation waited for simulated SMTP delay:

```text
Email Delay:
300ms - 800ms
```

Request lifecycle:

```text
Create Order
↓
Send Email
↓
Wait 300-800ms
↓
Return Response
```

Average additional latency:

```text
~500ms
```

### After

Order creation pushes email work to BullMQ:

```text
Create Order
↓
Add Job To Queue
↓
Return Response Immediately
```

Background worker:

```text
Email Worker
↓
Send Confirmation Email
```

Average latency removed:

```text
~460ms
```

---

## What Changed Between Before and After

* [Part A] N+1 fix on order history: 101 queries → 1 query
* [Part A] N+1 fix on menu endpoint: 23 queries → 1 query
* [Part A] Added 5 targeted PostgreSQL indexes
* [Part B] Redis caching on GET /restaurants (TTL 300 seconds)
* [Part B] Redis cache-aside implementation with cache HIT/MISS detection
* [Part B] Cache invalidation utility for restaurant updates
* [Part B] BullMQ async email processing
* [Part B] Removed approximately 460ms from POST /orders response time
* [Part B] Redis-backed rate limiting (10 requests/minute/user)
* [Part B] Background worker processing with concurrency = 5

---

## Final Outcome

### Database Optimization

| Metric                | Before |         After |
| --------------------- | -----: | ------------: |
| Order History Queries |    101 |             1 |
| Menu Queries          |     23 |             1 |
| Restaurant Queries    |      1 | 0 (cache hit) |

### API Performance

| Endpoint            | Improvement |
| ------------------- | ----------: |
| GET /restaurants    |       26.7× |
| GET /orders/history |       1.03× |
| POST /orders        |        4.9× |

### Infrastructure Improvements

* Redis introduced as caching layer
* Redis introduced for distributed rate limiting
* BullMQ introduced for asynchronous job processing
* Email delivery moved off the request path
* Cache invalidation strategy implemented
* API protected against request flooding

### Conclusion

Part A eliminated database inefficiencies through JOIN-based queries and targeted indexes.

Part B introduced Redis caching, Redis-backed rate limiting, and BullMQ background processing.

Together, these changes significantly reduced latency, eliminated unnecessary database work, improved scalability, and increased application resilience under load.
