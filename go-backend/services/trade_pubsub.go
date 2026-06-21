package services

import (
	"context"
	"encoding/json"
	"log"
)

func (p *WorkerPool) subscribeConfirms(ctx context.Context) {
	if p.redisClient == nil {
		log.Printf("[pubsub] redis client not set, skipping confirm subscriber")
		return
	}

	pubsub := p.redisClient.PSubscribe(ctx, redisTradeConfirmPrefix+"*")
	defer pubsub.Close()

	ch := pubsub.Channel()

	for {
		select {
		case <-ctx.Done():
			return

		case msg, ok := <-ch:
			if !ok {
				return
			}

			var confirm QueueConfirm

			if err := json.Unmarshal([]byte(msg.Payload), &confirm); err != nil {
				log.Printf("[pubsub] unmarshal error: %v", err)
				continue
			}

			conn, ok := p.lookupConn(confirm.ConnID)
			if !ok {
				// This connection is not on this instance.
				// Another running instance may own it.
				continue
			}

			data, err := json.Marshal(confirm)
			if err != nil {
				log.Printf("[pubsub] marshal error connID=%s: %v", confirm.ConnID, err)
				continue
			}

			if err := conn.Write(data); err != nil {
				log.Printf("[pubsub] write error connID=%s: %v", confirm.ConnID, err)
			}
		}
	}
}
