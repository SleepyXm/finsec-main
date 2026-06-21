package services

import "github.com/redis/go-redis/v9"

var claimTradeBatchScript = redis.NewScript(`
-- KEYS[1] = pending list
-- KEYS[2] = batch list
-- KEYS[3] = processing zset
-- ARGV[1] = max batch size
-- ARGV[2] = batch id
-- ARGV[3] = now unix milliseconds
-- ARGV[4] = batch ttl milliseconds

local max = tonumber(ARGV[1])
local batch_id = ARGV[2]
local now_ms = ARGV[3]
local ttl_ms = tonumber(ARGV[4])

local moved = 0

for i = 1, max do
	local item = redis.call("RPOP", KEYS[1])

	if not item then
		break
	end

	redis.call("LPUSH", KEYS[2], item)
	moved = moved + 1
end

if moved > 0 then
	redis.call("PEXPIRE", KEYS[2], ttl_ms)
	redis.call("ZADD", KEYS[3], now_ms, batch_id)
end

return moved
`)

var finishTradeBatchScript = redis.NewScript(`
-- KEYS[1] = batch list
-- KEYS[2] = processing zset
-- ARGV[1] = batch id

redis.call("DEL", KEYS[1])
redis.call("ZREM", KEYS[2], ARGV[1])

return 1
`)
