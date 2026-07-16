package services

import (
	"log"
	"math/rand"
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
