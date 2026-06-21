package services

import (
	"fmt"
	"net"
	"sync"

	"github.com/gobwas/ws/wsutil"
)

// WSConn is the single WebSocket connection type used by the pool,
// broadcast fanout, Redis confirm routing, and direct writes.
//
// ID is optional.
// - Empty ID: normal pooled/broadcast WebSocket.
// - Non-empty ID: connection can also receive targeted Redis confirmations.
type WSConn struct {
	ID string

	conn   net.Conn
	closed chan struct{}

	closeOnce sync.Once
	writeMu   sync.Mutex
}

// NewWSConn creates a normal WebSocket connection without a routing ID.
func NewWSConn(conn net.Conn) *WSConn {
	return &WSConn{
		conn:   conn,
		closed: make(chan struct{}),
	}
}

// NewIdentifiedWSConn creates a WebSocket connection with a routing ID.
// Use this instead of the old NewRedisConn.
func NewIdentifiedWSConn(connID string, conn net.Conn) *WSConn {
	return &WSConn{
		ID:     connID,
		conn:   conn,
		closed: make(chan struct{}),
	}
}

// Write writes a text WebSocket message safely.
//
// This replaces:
// - SafeWrite
// - SafeWriteRedis
// - WriteMsg
func (c *WSConn) Write(msg []byte) error {
	select {
	case <-c.closed:
		return fmt.Errorf("connection closed")
	default:
	}

	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	select {
	case <-c.closed:
		return fmt.Errorf("connection closed")
	default:
		return wsutil.WriteServerText(c.conn, msg)
	}
}

// Close closes the connection once.
//
// The previous Close implementation could panic if called twice because it
// directly closed the active channel. sync.Once prevents that.
func (c *WSConn) Close() error {
	var err error

	c.closeOnce.Do(func() {
		close(c.closed)
		err = c.conn.Close()
	})

	return err
}
