package structs

import (
	"net"
	"sync"
)

const (
	workerHardLimit  = 150
	workerSpawnLimit = 100
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
