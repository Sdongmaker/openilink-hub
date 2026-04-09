package bot

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/openilink/openilink-hub/internal/provider"
	"github.com/openilink/openilink-hub/internal/store/memstore"
)

// mockProvider implements provider.Provider for relay testing.
type mockProvider struct {
	mu       sync.Mutex
	sent     []provider.OutboundMessage
	statusFn func() string
}

func (m *mockProvider) Name() string   { return "mock" }
func (m *mockProvider) Status() string { return "connected" }
func (m *mockProvider) Start(ctx context.Context, opts provider.StartOptions) error {
	return nil
}
func (m *mockProvider) Stop() {}
func (m *mockProvider) Send(ctx context.Context, msg provider.OutboundMessage) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sent = append(m.sent, msg)
	return "ok", nil
}
func (m *mockProvider) SendTyping(ctx context.Context, recipient, ticket string, typing bool) error {
	return nil
}
func (m *mockProvider) GetConfig(ctx context.Context, recipient, contextToken string) (*provider.BotConfig, error) {
	return &provider.BotConfig{}, nil
}
func (m *mockProvider) DownloadMedia(ctx context.Context, media *provider.Media) ([]byte, error) {
	return []byte("fake-media-data"), nil
}
func (m *mockProvider) DownloadVoice(ctx context.Context, media *provider.Media, sampleRate int) ([]byte, error) {
	return []byte("fake-voice-data"), nil
}

func (m *mockProvider) sentMessages() []provider.OutboundMessage {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := make([]provider.OutboundMessage, len(m.sent))
	copy(cp, m.sent)
	return cp
}

func setupRelayTest(t *testing.T) (*Manager, *Instance, *Instance, *mockProvider, *mockProvider) {
	t.Helper()
	s := memstore.New()

	mgr := &Manager{
		instances: make(map[string]*Instance),
		store:     s,
		dlSem:     make(chan struct{}, 1),
	}

	provA := &mockProvider{}
	instA := &Instance{DBID: "bot-a", OwnerExtID: "owner-a", Provider: provA}
	provB := &mockProvider{}
	instB := &Instance{DBID: "bot-b", OwnerExtID: "owner-b", Provider: provB}

	mgr.instances["bot-a"] = instA
	mgr.instances["bot-b"] = instB

	s.EnsureRelayMember("bot-a")
	s.EnsureRelayMember("bot-b")

	return mgr, instA, instB, provA, provB
}

func TestRelayTextMessage(t *testing.T) {
	mgr, instA, _, _, provB := setupRelayTest(t)

	msg := provider.InboundMessage{
		ExternalID: "msg-1",
		Sender:     "owner-a",
		Items: []provider.MessageItem{
			{Type: "text", Text: "hello group"},
		},
	}

	mgr.relayToVirtualGroup(instA, msg)
	// Wait for async goroutines
	time.Sleep(200 * time.Millisecond)

	sent := provB.sentMessages()
	if len(sent) != 1 {
		t.Fatalf("expected 1 sent message, got %d", len(sent))
	}
	if sent[0].Recipient != "owner-b" {
		t.Errorf("recipient = %q, want %q", sent[0].Recipient, "owner-b")
	}
	emojiA := mgr.store.GetRelayEmoji("bot-a")
	expected := emojiA + " | hello group"
	if sent[0].Text != expected {
		t.Errorf("text = %q, want %q", sent[0].Text, expected)
	}
}

func TestRelaySelfExclusion(t *testing.T) {
	mgr, instA, _, provA, _ := setupRelayTest(t)

	msg := provider.InboundMessage{
		ExternalID: "msg-2",
		Sender:     "owner-a",
		Items: []provider.MessageItem{
			{Type: "text", Text: "test"},
		},
	}

	mgr.relayToVirtualGroup(instA, msg)
	time.Sleep(200 * time.Millisecond)

	// Bot A should NOT receive its own message
	sent := provA.sentMessages()
	if len(sent) != 0 {
		t.Errorf("self-exclusion failed: bot A received %d messages", len(sent))
	}
}

func TestRelaySkipsGroupMessage(t *testing.T) {
	mgr, instA, _, _, provB := setupRelayTest(t)

	msg := provider.InboundMessage{
		ExternalID: "msg-3",
		Sender:     "owner-a",
		GroupID:    "group@chatroom",
		Items: []provider.MessageItem{
			{Type: "text", Text: "group msg"},
		},
	}

	mgr.relayToVirtualGroup(instA, msg)
	time.Sleep(200 * time.Millisecond)

	sent := provB.sentMessages()
	if len(sent) != 0 {
		t.Errorf("group message should not be relayed, got %d messages", len(sent))
	}
}

func TestRelayMediaMessage(t *testing.T) {
	mgr, instA, _, _, provB := setupRelayTest(t)

	msg := provider.InboundMessage{
		ExternalID: "msg-4",
		Sender:     "owner-a",
		Items: []provider.MessageItem{
			{Type: "image", FileName: "photo.jpg", Media: &provider.Media{URL: "http://example.com/img.jpg"}},
		},
	}

	mgr.relayToVirtualGroup(instA, msg)
	time.Sleep(200 * time.Millisecond)

	sent := provB.sentMessages()
	if len(sent) != 1 {
		t.Fatalf("expected 1 sent message, got %d", len(sent))
	}
	if len(sent[0].Data) == 0 {
		t.Error("expected media data to be present")
	}
	if sent[0].FileName != "photo.jpg" {
		t.Errorf("filename = %q, want %q", sent[0].FileName, "photo.jpg")
	}
}

func TestRelayMultipleTargets(t *testing.T) {
	s := memstore.New()
	mgr := &Manager{
		instances: make(map[string]*Instance),
		store:     s,
		dlSem:     make(chan struct{}, 1),
	}

	provA := &mockProvider{}
	provB := &mockProvider{}
	provC := &mockProvider{}

	instA := &Instance{DBID: "bot-a", OwnerExtID: "owner-a", Provider: provA}
	instB := &Instance{DBID: "bot-b", OwnerExtID: "owner-b", Provider: provB}
	instC := &Instance{DBID: "bot-c", OwnerExtID: "owner-c", Provider: provC}

	mgr.instances["bot-a"] = instA
	mgr.instances["bot-b"] = instB
	mgr.instances["bot-c"] = instC

	s.EnsureRelayMember("bot-a")
	s.EnsureRelayMember("bot-b")
	s.EnsureRelayMember("bot-c")

	msg := provider.InboundMessage{
		ExternalID: "msg-5",
		Sender:     "owner-a",
		Items: []provider.MessageItem{
			{Type: "text", Text: "broadcast"},
		},
	}

	mgr.relayToVirtualGroup(instA, msg)
	time.Sleep(300 * time.Millisecond)

	sentB := provB.sentMessages()
	sentC := provC.sentMessages()
	if len(sentB) != 1 {
		t.Errorf("bot-b got %d messages, want 1", len(sentB))
	}
	if len(sentC) != 1 {
		t.Errorf("bot-c got %d messages, want 1", len(sentC))
	}
}
