package bot

import (
	"encoding/json"
	"log/slog"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/openilink/openilink-hub/internal/store"
)

// RelayAdminHub manages admin WebSocket connections for real-time relay messages.
type RelayAdminHub struct {
	mu    sync.RWMutex
	conns map[*RelayAdminConn]struct{}
}

// RelayAdminConn is a single admin WebSocket connection.
type RelayAdminConn struct {
	ws   *websocket.Conn
	send chan []byte
	hub  *RelayAdminHub
}

// NewRelayAdminHub creates a new hub for admin relay viewers.
func NewRelayAdminHub() *RelayAdminHub {
	return &RelayAdminHub{
		conns: make(map[*RelayAdminConn]struct{}),
	}
}

// Register adds an admin connection.
func (h *RelayAdminHub) Register(c *RelayAdminConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.conns[c] = struct{}{}
}

// Unregister removes an admin connection.
func (h *RelayAdminHub) Unregister(c *RelayAdminConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.conns[c]; ok {
		delete(h.conns, c)
		close(c.send)
	}
}

// Broadcast sends a relay message to all admin connections.
func (h *RelayAdminHub) Broadcast(msg *store.RelayMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.conns {
		select {
		case c.send <- data:
		default:
			// Slow consumer, skip.
		}
	}
}

// NewRelayAdminConn creates a new admin WebSocket connection.
func NewRelayAdminConn(ws *websocket.Conn, hub *RelayAdminHub) *RelayAdminConn {
	return &RelayAdminConn{
		ws:   ws,
		send: make(chan []byte, 64),
		hub:  hub,
	}
}

// WritePump pumps messages from the send channel to the WebSocket.
func (c *RelayAdminConn) WritePump() {
	defer c.ws.Close()
	for msg := range c.send {
		if err := c.ws.WriteMessage(websocket.TextMessage, msg); err != nil {
			slog.Debug("relay admin ws write failed", "err", err)
			return
		}
	}
}

// ReadPump blocks reading (discards all client messages) until disconnect.
func (c *RelayAdminConn) ReadPump() {
	defer func() {
		c.hub.Unregister(c)
		c.ws.Close()
	}()
	for {
		if _, _, err := c.ws.ReadMessage(); err != nil {
			break
		}
	}
}
