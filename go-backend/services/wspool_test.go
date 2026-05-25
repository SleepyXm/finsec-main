package services

import (
	"fmt"
	"net"
	"runtime"
	"sync"
	"testing"
	"time"
)

// mockConn satisfies net.Conn without a real socket
type mockConn struct {
	mu     sync.Mutex
	closed bool
}

func (m *mockConn) Read(b []byte) (int, error) { return 0, nil }
func (m *mockConn) Write(b []byte) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return 0, fmt.Errorf("closed")
	}
	return len(b), nil
}
func (m *mockConn) Close() error {
	m.mu.Lock()
	m.closed = true
	m.mu.Unlock()
	return nil
}
func (m *mockConn) LocalAddr() net.Addr                { return &net.TCPAddr{} }
func (m *mockConn) RemoteAddr() net.Addr               { return &net.TCPAddr{} }
func (m *mockConn) SetDeadline(t time.Time) error      { return nil }
func (m *mockConn) SetReadDeadline(t time.Time) error  { return nil }
func (m *mockConn) SetWriteDeadline(t time.Time) error { return nil }

func TestWorkerPoolRaceOnRemove(t *testing.T) {
	const (
		iterations  = 500
		connsPerRun = 5
	)

	for i := 0; i < iterations; i++ {
		pool := NewWorkerPool()

		conns := make([]*WSConn, connsPerRun)
		for j := 0; j < connsPerRun; j++ {
			conns[j] = NewWSConn(&mockConn{})
			pool.AddConn(conns[j])
		}

		var wg sync.WaitGroup

		// goroutine 1: hammer fanOut with messages
		wg.Add(1)
		go func() {
			defer wg.Done()
			for k := 0; k < 100; k++ {
				pool.Send(Message{
					Type:    "test",
					Payload: []byte(`{"test":true}`),
				})
				runtime.Gosched()
			}
		}()

		// goroutine 2: remove all conns simultaneously
		// this is what triggers worker close
		wg.Add(1)
		go func() {
			defer wg.Done()
			runtime.Gosched() // let sender get ahead
			for _, c := range conns {
				pool.RemoveConn(c)
				runtime.Gosched() // yield at each removal
			}
		}()

		wg.Wait()
	}
}
