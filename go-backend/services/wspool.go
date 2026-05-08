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
	workerAdjectives = []string{"amber", "brisk", "cedar", "dusty", "ember", "frosty", "gilded", "hollow", "ivory", "jade"}
	workerNouns      = []string{"anvil", "birch", "crane", "drifter", "falcon", "gorge", "herald", "iron", "juniper", "knoll"}
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
}

type Worker struct {
	name  string
	conns []*WSConn
	mu    sync.Mutex
	count int
	msgCh chan Message
}

type WorkerPool struct {
	workers []*Worker
	mu      sync.Mutex
	msgCh   chan Message
}

func newWorkerName() string {
	return workerAdjectives[rand.Intn(len(workerAdjectives))] + "-" + workerNouns[rand.Intn(len(workerNouns))]
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
				// worker is backed up, skip to avoid blocking fan-out
				log.Printf("[wspool] worker backed up, skipping message")
			}
		}
		p.mu.Unlock()
	}
}

// spawnWorker creates a new worker, registers it, and starts its write loop
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

// run is the worker's write loop — reads messages and writes to all its connections
func (w *Worker) run() {
	for msg := range w.msgCh {
		w.mu.Lock()
		for _, c := range w.conns {
			if err := SafeWrite(c, msg.Payload); err != nil {
				// connection died, cleaned up by remove conn
				log.Printf("[wspool] write error, connection likely closed: %v", err)
			}
		}
		w.mu.Unlock()
	}
}

// Guards adding latency to connections, not a large problem, remember 3000+ datapoints for x users in the ms range is still crazy
// AddConn finds or creates a worker for the incoming connection
func (p *WorkerPool) AddConn(c *WSConn) {
	p.mu.Lock()
	defer p.mu.Unlock()

	var target *Worker
	for _, w := range p.workers {
		w.mu.Lock()
		if w.count < workerSpawnLimit { // ← use spawn limit, not hard limit
			target = w
			w.mu.Unlock()
			break
		}
		w.mu.Unlock()
	}

	if target == nil {
		// all workers are at or past spawn limit — check if we're also at hard limit
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

	// preemptive spawn only if no worker has headroom below spawn limit
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

// RemoveConn removes a connection from its worker and cleans up empty workers
func (p *WorkerPool) RemoveConn(c *WSConn) {
	p.mu.Lock()
	defer p.mu.Unlock()

	for i, w := range p.workers {
		w.mu.Lock()
		for j, wc := range w.conns {
			if wc == c {
				// remove from slice
				w.conns = append(w.conns[:j], w.conns[j+1:]...)
				w.count--
				log.Printf("[wspool] [%s] connection removed | now at %d", w.name, w.count)

				// clean up empty worker
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

func (c *WSConn) Close() {
	close(c.active)
}

func (p *WorkerPool) Send(msg Message) {
	p.msgCh <- msg
}

func (c *WSConn) Write(msg []byte) error {
	return SafeWrite(c, msg)
}
