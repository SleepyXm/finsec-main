package services

import "testing"

func TestRemoveConnRetainsOneIdleWorkerAndStopsTheRest(t *testing.T) {
	conn := &WSConn{}
	retained := &Worker{
		name: "retained", conns: []*WSConn{conn}, count: 1,
		msgCh: make(chan Message),
	}
	removed := &Worker{name: "removed", msgCh: make(chan Message)}
	pool := &WorkerPool{workers: []*Worker{retained, removed}}

	pool.RemoveConn(conn)

	if len(pool.workers) != 1 {
		t.Fatalf("workers after final disconnect = %d, expected 1", len(pool.workers))
	}
	if pool.workers[0].count != 0 || len(pool.workers[0].conns) != 0 {
		t.Fatalf("retained worker still has connections: %#v", pool.workers[0])
	}
	if retained.conns[:cap(retained.conns)][0] != nil {
		t.Fatal("removed connection is still referenced by the worker backing array")
	}
	if pool.workers[:cap(pool.workers)][1] != nil {
		t.Fatal("removed worker is still referenced by the pool backing array")
	}
	select {
	case _, open := <-removed.msgCh:
		if open {
			t.Fatal("removed worker channel is still open")
		}
	default:
		t.Fatal("removed worker was not stopped")
	}
}
