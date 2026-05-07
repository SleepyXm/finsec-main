package services

import (
	"fmt"
	"log"
	"math/rand"
	"net"
	"sync"

	"github.com/gobwas/ws/wsutil"
)

var (
	adjectives = []string{"eager", "bold", "calm", "swift", "bright", "sharp", "keen", "cool"}
	nouns      = []string{"lovelace", "turing", "hopper", "dijkstra", "knuth", "ritchie", "thompson", "berners"}
)

const (
	workerHardLimit  = 100
	workerSpawnLimit = 65
)

type Message struct {
	Type    string
	Payload []byte
}

type WSConn struct {
	conn   net.Conn
	active chan struct{}
	once   sync.Once
}

type Worker struct {
	name  string
	conns []*WSConn
	msgCh chan Message
	mu    sync.Mutex
	count int
}

type WorkerPool struct {
	workers []*Worker
	mu      sync.Mutex
	msgCh   chan Message
}

func generateWorkerName() string {
	return fmt.Sprintf("%s_%s",
		adjectives[rand.Intn(len(adjectives))],
		nouns[rand.Intn(len(nouns))],
	)
}

func SafeWrite(c *WSConn, msg []byte) error {
	select {
	case <-c.active:
		return fmt.Errorf("connection closed")
	default:
		return wsutil.WriteServerText(c.conn, msg)
	}
}

func NewWSConn(conn net.Conn) *WSConn {
	return &WSConn{
		conn:   conn,
		active: make(chan struct{}),
	}
}

// NewWorkerPool creates a pool and starts the fan-out goroutine
func NewWorkerPool() *WorkerPool {
	p := &WorkerPool{
		msgCh: make(chan Message, 256),
	}
	go p.fanOut()
	return p
}

// fanOut reads from the pool's msgCh and distributes to all workers
func (p *WorkerPool) fanOut() {
	for msg := range p.msgCh {
		p.mu.Lock()
		for _, w := range p.workers {
			select {
			case w.msgCh <- msg:
			default:
				log.Printf("[wspool] %s | backed up, skipping message", w.name)
			}
		}
		p.mu.Unlock()
	}
}

// spawnWorker creates a new worker, registers it, and starts its write loop
func (p *WorkerPool) spawnWorker() *Worker {
	w := &Worker{
		name:  adjectives[rand.Intn(len(adjectives))] + "_" + nouns[rand.Intn(len(nouns))],
		conns: make([]*WSConn, 0, workerHardLimit),
		msgCh: make(chan Message, 256),
	}
	p.workers = append(p.workers, w)
	go w.run()
	log.Printf("[wspool] spawned %s | total workers: %d", w.name, len(p.workers))
	return w
}

// run is the worker's write loop — reads messages and writes to all its connections
func (w *Worker) run() {
	for msg := range w.msgCh {
		w.mu.Lock()
		for _, c := range w.conns {
			if err := SafeWrite(c, msg.Payload); err != nil {
				log.Printf("[wspool] %s | write error: %v", w.name, err)
			}
		}
		w.mu.Unlock()
	}
}

// AddConn finds or creates a worker for the incoming connection
func (p *WorkerPool) AddConn(c *WSConn) {
	p.mu.Lock()
	defer p.mu.Unlock()

	var target *Worker
	var hasRoom bool

	for _, w := range p.workers {
		w.mu.Lock()
		if w.count < workerHardLimit {
			if target == nil || w.count < target.count {
				target = w
			}
			if w.count < workerSpawnLimit {
				hasRoom = true
			}
		}
		w.mu.Unlock()
	}

	if target == nil {
		log.Printf("[wspool] emergency spawn — all workers at hard limit")
		target = p.spawnWorker()
	} else if !hasRoom {
		log.Printf("[wspool] preemptive spawn — all workers above soft cap")
		p.spawnWorker()
	}

	target.mu.Lock()
	target.conns = append(target.conns, c)
	target.count++
	log.Printf("[wspool] %s | %d users", target.name, target.count)
	target.mu.Unlock()
}

// RemoveConn — no longer splices while iterating; marks empty workers
// for a separate cleanup pass to avoid the index-skip bug.
func (p *WorkerPool) RemoveConn(c *WSConn) {
	p.mu.Lock()
	defer p.mu.Unlock()

	for _, w := range p.workers {
		w.mu.Lock()
		found := false
		for j, wc := range w.conns {
			if wc == c {
				// Swap-remove: O(1), avoids shifting the slice
				last := len(w.conns) - 1
				w.conns[j] = w.conns[last]
				w.conns[last] = nil // release the pointer for GC
				w.conns = w.conns[:last]
				w.count--
				log.Printf("[wspool] %s | connection removed | now at %d users", w.name, w.count)
				found = true
				break
			}
		}
		w.mu.Unlock()

		if found {
			// Prune empty workers in a separate pass now that we've released w.mu.
			// We hold p.mu so the workers slice is stable.
			p.pruneEmptyWorkers()
			return
		}
	}

	// If we reach here the connection was never found — it was already removed
	// or never added. Log it so you can track whether this is happening.
	log.Printf("[wspool] RemoveConn: connection not found in any worker")
}

// pruneEmptyWorkers removes and shuts down workers with zero connections.
// Must be called with p.mu held.
func (p *WorkerPool) pruneEmptyWorkers() {
	live := p.workers[:0] // reuse the backing array
	for _, w := range p.workers {
		w.mu.Lock()
		empty := w.count == 0
		w.mu.Unlock()

		if empty {
			close(w.msgCh) // stops the worker's run() goroutine
			log.Printf("[wspool] %s | empty, shutting down | total workers: %d", w.name, len(live))
		} else {
			live = append(live, w)
		}
	}
	p.workers = live
}

// Close is safe to call multiple times — only the first call closes the channel.
// This matters because the handler defers both conn.Close and wsc.Close, and a
// write error in SafeWrite can trigger an early return that races with the defers.
func (c *WSConn) Close() {
	c.once.Do(func() {
		close(c.active)
	})
}

func (p *WorkerPool) Send(msg Message) {
	p.msgCh <- msg
}

func (c *WSConn) Write(msg []byte) error {
	return SafeWrite(c, msg)
}
