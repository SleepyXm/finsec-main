package services

import (
	"log"
	"math/rand"
	"sync"
)

const (
	workerHardLimit  = 250
	workerSpawnLimit = 125
)

var (
	workerAdjectives = []string{
		"amber",
		"brisk",
		"cedar",
		"dusty",
		"ember",
		"frosty",
		"gilded",
		"hollow",
		"ivory",
		"jade",
	}

	workerNouns = []string{
		"anvil",
		"birch",
		"crane",
		"drifter",
		"falcon",
		"gorge",
		"herald",
		"iron",
		"juniper",
		"knoll",
	}
)

type Message struct {
	Type    string
	Payload []byte
}

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

		conns := make([]*WSConn, len(w.conns))
		copy(conns, w.conns)

		w.mu.Unlock()

		for _, c := range conns {
			if err := c.Write(msg.Payload); err != nil {
				log.Printf("[wspool] write error worker=%s: %v", w.name, err)
			}
		}
	}
}
