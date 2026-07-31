package services

import (
	"log"
	"slices"
)

func NewWorkerPool() *WorkerPool {
	p := &WorkerPool{
		msgCh:       make(chan Message, 256),
		registry:    NewConnRegistry(),
		flushSignal: make(chan struct{}, 1),
	}

	go p.fanOut()

	return p
}

func (p *WorkerPool) fanOut() {
	for msg := range p.msgCh {
		p.mu.Lock()
		for _, w := range p.workers {
			select {
			case w.msgCh <- msg:
			default:
				log.Printf("[wspool] worker=%s backed up, skipping message", w.name)
			}
		}
		p.mu.Unlock()
	}
}

// spawnWorkerLocked creates and starts a worker.
//
// Caller must hold p.mu.
func (p *WorkerPool) spawnWorkerLocked() *Worker {
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

		if w.count < workerHardLimit {
			target = w
			w.mu.Unlock()
			break
		}

		w.mu.Unlock()
	}

	if target == nil {
		log.Printf("[wspool] emergency spawn — all workers at hard limit")
		target = p.spawnWorkerLocked()
	}

	target.mu.Lock()

	target.conns = append(target.conns, c)
	target.count++

	targetName := target.name
	targetCount := target.count

	target.mu.Unlock()

	log.Printf("[wspool] [%s] %d connections", targetName, targetCount)

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

	if !hasRoom && targetCount >= workerSpawnLimit {
		log.Printf("[wspool] [%s] hit spawn threshold — preparing new worker", targetName)
		p.spawnWorkerLocked()
	}

	if targetCount >= workerHardLimit {
		log.Printf("[wspool] [%s] at hard limit", targetName)
	}
}

func (p *WorkerPool) RemoveConn(c *WSConn) {
	p.mu.Lock()
	defer p.mu.Unlock()

	for _, w := range p.workers {
		w.mu.Lock()

		for i, wc := range w.conns {
			if wc == c {
				w.conns = slices.Delete(w.conns, i, i+1)
				w.count--

				log.Printf("[wspool] [%s] connection removed | now at %d", w.name, w.count)

				w.mu.Unlock()
				for i := len(p.workers) - 1; i > 0; i-- {
					idleWorker := p.workers[i]
					idleWorker.mu.Lock()
					idle := idleWorker.count == 0
					idleWorker.mu.Unlock()
					if idle {
						p.workers = slices.Delete(p.workers, i, i+1)
						close(idleWorker.msgCh)
						log.Printf("[wspool] removed idle worker %q | total workers: %d", idleWorker.name, len(p.workers))
					}
				}
				return
			}
		}

		w.mu.Unlock()
	}
}

func (p *WorkerPool) Send(msg Message) {
	p.msgCh <- msg
}
