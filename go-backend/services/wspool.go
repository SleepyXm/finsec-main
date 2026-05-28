package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net"
	"sync"
	"time"

	"github.com/gobwas/ws/wsutil"
	"github.com/redis/go-redis/v9"
)

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

const (
	workerHardLimit  = 250
	workerSpawnLimit = 200

	flushEvery     = 150 * time.Millisecond
	redisQueueKey  = "trades:pending"
	redisPubSubKey = "trades:confirm:"
	queueEntryTTL  = 30 * time.Second
)

var (
	workerAdjectives = []string{"amber", "brisk", "cedar", "dusty", "ember", "frosty", "gilded", "hollow", "ivory", "jade"}
	workerNouns      = []string{"anvil", "birch", "crane", "drifter", "falcon", "gorge", "herald", "iron", "juniper", "knoll"}
)

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

type Message struct {
	Type    string
	Payload []byte
}

// -----------------------------------------------------------------------
// WSConn
// -----------------------------------------------------------------------

type WSConn struct {
	conn   net.Conn
	active chan struct{}
}

func NewWSConn(conn net.Conn) *WSConn {
	return &WSConn{
		conn:   conn,
		active: make(chan struct{}),
	}
}

func SafeWrite(c *WSConn, msg []byte) error {
	select {
	case <-c.active:
		return fmt.Errorf("connection closed")
	default:
		return wsutil.WriteServerText(c.conn, msg)
	}
}

func (c *WSConn) Close() {
	close(c.active)
}

func (c *WSConn) Write(msg []byte) error {
	return SafeWrite(c, msg)
}

// -----------------------------------------------------------------------
// Worker
// -----------------------------------------------------------------------

type Worker struct {
	name  string
	conns []*WSConn
	mu    sync.Mutex
	count int
	msgCh chan Message
}

func newWorkerName() string {
	return workerAdjectives[rand.Intn(len(workerAdjectives))] + "-" + workerNouns[rand.Intn(len(workerNouns))]
}

func (w *Worker) run() {
	for msg := range w.msgCh {
		w.mu.Lock()
		for _, c := range w.conns {
			if err := SafeWrite(c, msg.Payload); err != nil {
				log.Printf("[wspool] write error, connection likely closed: %v", err)
			}
		}
		w.mu.Unlock()
	}
}

// -----------------------------------------------------------------------
// WorkerPool
// -----------------------------------------------------------------------

type WorkerPool struct {
	workers     []*Worker
	mu          sync.Mutex
	msgCh       chan Message
	redisClient *redis.Client // nil if not needed

	// conn registry for targeted delivery — connID -> RedisConn
	registry   map[string]*RedisConn
	registryMu sync.RWMutex
}

func NewWorkerPool() *WorkerPool {
	p := &WorkerPool{
		msgCh:    make(chan Message, 256),
		registry: make(map[string]*RedisConn),
	}
	go p.fanOut()
	return p
}

// -----------------------------------------------------------------------
// Pub/sub subscriber — delivers confirms to the right conn on this instance
// -----------------------------------------------------------------------

func (p *WorkerPool) subscribeConfirms(ctx context.Context) {
	// Subscribe to all confirm channels on this instance
	pubsub := p.redisClient.PSubscribe(ctx, redisPubSubKey+"*")
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
				// connection not on this instance, another instance will deliver it
				continue
			}
			data, _ := json.Marshal(confirm)
			if err := conn.Write(data); err != nil {
				log.Printf("[pubsub] write error connID=%s: %v", confirm.ConnID, err)
			}
		}
	}
}

// -----------------------------------------------------------------------
// Existing pool methods — unchanged
// -----------------------------------------------------------------------

func (p *WorkerPool) fanOut() {
	for msg := range p.msgCh {
		p.mu.Lock()
		for _, w := range p.workers {
			select {
			case w.msgCh <- msg:
			default:
				log.Printf("[wspool] worker backed up, skipping message")
			}
		}
		p.mu.Unlock()
	}
}

func (p *WorkerPool) newfanOut() {
    for msg := range p.msgCh {
        p.mu.Lock()
        workers := make([]*Worker, len(p.workers))
        copy(workers, p.workers)
        p.mu.Unlock()

        for _, w := range workers {
            select {
            case w.msgCh <- msg:
            default:
                log.Printf("[wspool] worker backed up, skipping message")
            }
        }
    }
}

func (p *WorkerPool) spawnWorker() *Worker {
	w := &Worker{
		name:  newWorkerName(),
		conns: make([]*WSConn, 0, workerHardLimit),
		msgCh: make(chan Message, 256),
	}
	p.workers = append(p.workers, w)
	go w.run()
	log.Printf("[wspool] spawned worker %q | total workers: %d", w.name, len(p.workers))
	return w
}

func (p *WorkerPool) AddConn(c *WSConn) {
	p.mu.Lock()
	defer p.mu.Unlock()

	var target *Worker
	for _, w := range p.workers {
		w.mu.Lock()
		if w.count < workerSpawnLimit {
			target = w
			w.mu.Unlock()
			break
		}
		w.mu.Unlock()
	}

	if target == nil {
		for _, w := range p.workers {
			w.mu.Lock()
			if w.count < workerHardLimit {
				target = w
				w.mu.Unlock()
				break
			}
			w.mu.Unlock()
		}
	}

	if target == nil {
		log.Printf("[wspool] emergency spawn — all workers at hard limit")
		target = p.spawnWorker()
	}

	target.mu.Lock()
	target.conns = append(target.conns, c)
	target.count++
	log.Printf("[wspool] [%s] %d connections", target.name, target.count)

	hasRoom := false
	for _, w := range p.workers {
		if w == target {
			continue
		}
		w.mu.Lock()
		if w.count < workerSpawnLimit {
			hasRoom = true
			w.mu.Unlock()
			break
		}
		w.mu.Unlock()
	}
	if !hasRoom && target.count >= workerSpawnLimit {
		log.Printf("[wspool] [%s] hit %d connections — spawning new worker", target.name, target.count)
		p.spawnWorker()
	}

	target.mu.Unlock()
}

func (p *WorkerPool) RemoveConn(c *WSConn) {
	p.mu.Lock()
	defer p.mu.Unlock()

	for i, w := range p.workers {
		w.mu.Lock()
		for j, wc := range w.conns {
			if wc == c {
				w.conns = append(w.conns[:j], w.conns[j+1:]...)
				w.count--
				log.Printf("[wspool] [%s] connection removed | now at %d", w.name, w.count)
				if w.count == 0 {
					close(w.msgCh)
					p.workers = append(p.workers[:i], p.workers[i+1:]...)
					log.Printf("[wspool] [%s] empty, removing | total workers: %d", w.name, len(p.workers))
				}
				w.mu.Unlock()
				return
			}
		}
		w.mu.Unlock()
	}
}

func (p *WorkerPool) Send(msg Message) {
	p.msgCh <- msg
}

func (c *WSConn) WriteMsg(msg []byte) error {
	return SafeWrite(c, msg)
}
