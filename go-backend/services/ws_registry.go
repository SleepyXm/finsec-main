package services

import "sync"

// ConnRegistry tracks live WebSocket connections by routing ID.
//
// This replaces:
// - registry map[string]*RedisConn
// - registryMu
// - lookupConn returning *RedisConn
type ConnRegistry struct {
	mu    sync.RWMutex
	conns map[string]*WSConn
}

func NewConnRegistry() *ConnRegistry {
	return &ConnRegistry{
		conns: make(map[string]*WSConn),
	}
}

func (r *ConnRegistry) Register(c *WSConn) {
	if c == nil || c.ID == "" {
		return
	}

	r.mu.Lock()
	r.conns[c.ID] = c
	r.mu.Unlock()
}

func (r *ConnRegistry) Unregister(c *WSConn) {
	if c == nil || c.ID == "" {
		return
	}

	r.mu.Lock()
	delete(r.conns, c.ID)
	r.mu.Unlock()
}

func (r *ConnRegistry) Lookup(connID string) (*WSConn, bool) {
	r.mu.RLock()
	c, ok := r.conns[connID]
	r.mu.RUnlock()

	return c, ok
}

func (p *WorkerPool) RegisterConn(c *WSConn) {
	p.registry.Register(c)
}

func (p *WorkerPool) UnregisterConn(c *WSConn) {
	p.registry.Unregister(c)
}

func (p *WorkerPool) lookupConn(connID string) (*WSConn, bool) {
	return p.registry.Lookup(connID)
}
