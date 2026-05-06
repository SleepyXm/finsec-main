package services

import (
	"fmt"
	"log"
	"net"
	"sync"

	"github.com/gobwas/ws/wsutil"
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
		conns: make([]*WSConn, 0, workerHardLimit),
		msgCh: make(chan Message, 256),
	}
	p.workers = append(p.workers, w)
	go w.run()
	log.Printf("[wspool] building new worker | total workers: %d", len(p.workers))
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

// AddConn finds or creates a worker for the incoming connection
func (p *WorkerPool) AddConn(c *WSConn) {
	p.mu.Lock()
	defer p.mu.Unlock()

	// find a worker with room
	var target *Worker
	for _, w := range p.workers {
		w.mu.Lock()
		if w.count < workerHardLimit {
			target = w
			w.mu.Unlock()
			break
		}
		w.mu.Unlock()
	}

	// emergency spawn — all workers full
	if target == nil {
		log.Printf("[wspool] emergency spawn — all workers at hard limit")
		target = p.spawnWorker()
	}

	target.mu.Lock()
	target.conns = append(target.conns, c)
	target.count++
	log.Printf("[wspool] websocket at %d users on worker", target.count)

	// preemptive spawn at 65
	if target.count >= workerSpawnLimit {
		log.Printf("[wspool] preemptive spawn triggered at %d connections", target.count)
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
				log.Printf("[wspool] connection removed | worker now at %d users", w.count)

				// clean up empty worker
				if w.count == 0 {
					close(w.msgCh)
					p.workers = append(p.workers[:i], p.workers[i+1:]...)
					log.Printf("[wspool] worker removed | total workers: %d", len(p.workers))
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
