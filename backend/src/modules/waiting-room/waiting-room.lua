--[[
  Waiting Room Lua Script — T4.1 (atomic threshold check).
  
  Atomically:
  1. Remove expired sessions (score < now)
  2. Add user to active set with TTL
  3. Count active users
  4. If count <= threshold: return { allowed = 1 }
  5. If count > threshold: remove user, add to queue, return { allowed = 0, token, position }
  
  KEYS:
    1 = WR_ACTIVE_KEY (siak:wr:active)
    2 = WR_QUEUE_KEY (siak:wr:queue)
    3 = token key prefix (siak:wr:token:)
  
  ARGV:
    1 = userKey
    2 = expiry (epoch ms)
    3 = threshold
    4 = now (epoch ms)
    5 = token (UUID)
    6 = token TTL seconds
--]]

local activeKey = KEYS[1]
local queueKey = KEYS[2]
local tokenPrefix = KEYS[3]

local userKey = ARGV[1]
local expiry = tonumber(ARGV[2])
local threshold = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local token = ARGV[5]
local tokenTtl = tonumber(ARGV[6])

-- 1. Clean up expired sessions
redis.call('ZREMRANGEBYSCORE', activeKey, '-inf', now)

-- 2. Add user to active set
local added = redis.call('ZADD', activeKey, expiry, userKey)

-- 3. Count active users
local count = redis.call('ZCARD', activeKey)

-- 4. Check threshold
if count <= threshold then
  return { 1 } -- allowed = true
end

-- 5. Over threshold: remove user from active, add to queue
redis.call('ZREM', activeKey, userKey)

-- Store token details
local tokenKey = tokenPrefix .. token
redis.call('SET', tokenKey, cjson.encode({ userKey = userKey, createdAt = now }), 'EX', tokenTtl)

-- Add to queue (FIFO)
local position = redis.call('RPUSH', queueKey, token)

return { 0, token, position } -- allowed = false, token, position