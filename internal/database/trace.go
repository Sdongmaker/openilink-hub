package database

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

// OTel span kinds
const (
	SpanKindInternal = "internal"
	SpanKindClient   = "client"
	SpanKindServer   = "server"
)

// OTel status codes
const (
	StatusUnset = "unset"
	StatusOK    = "ok"
	StatusError = "error"
)

// SpanEvent is a timestamped annotation on a span.
type SpanEvent struct {
	Name       string         `json:"name"`
	Timestamp  int64          `json:"timestamp"` // unix millis
	Attributes map[string]any `json:"attributes,omitempty"`
}

// TraceSpan is a single OTel-style span.
type TraceSpan struct {
	ID            int64          `json:"id"`
	TraceID       string         `json:"trace_id"`
	SpanID        string         `json:"span_id"`
	ParentSpanID  string         `json:"parent_span_id,omitempty"`
	Name          string         `json:"name"`
	Kind          string         `json:"kind"`
	StatusCode    string         `json:"status_code"`
	StatusMessage string         `json:"status_message,omitempty"`
	StartTime     int64          `json:"start_time"` // unix millis
	EndTime       int64          `json:"end_time"`   // unix millis
	Attributes    map[string]any `json:"attributes,omitempty"`
	Events        []SpanEvent    `json:"events,omitempty"`
	BotID         string         `json:"bot_id,omitempty"`
	CreatedAt     int64          `json:"created_at"`
}

func (s *TraceSpan) DurationMs() int64 {
	if s.EndTime > s.StartTime {
		return s.EndTime - s.StartTime
	}
	return 0
}

func genSpanID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func genTraceID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return "tr_" + hex.EncodeToString(b)
}

// Tracer creates and manages spans for a single trace.
type Tracer struct {
	mu      sync.Mutex
	db      *DB
	traceID string
	botID   string
	spans   []*SpanBuilder
}

// NewTracer creates a tracer for a new message trace.
func NewTracer(db *DB, botID string) *Tracer {
	return &Tracer{
		db:      db,
		traceID: genTraceID(),
		botID:   botID,
	}
}

func (t *Tracer) TraceID() string { return t.traceID }

// Start begins a new span. Call End() on the returned SpanBuilder when done.
func (t *Tracer) Start(name string, kind string, attrs map[string]any) *SpanBuilder {
	sb := &SpanBuilder{
		tracer:     t,
		spanID:     genSpanID(),
		name:       name,
		kind:       kind,
		startTime:  time.Now().UnixMilli(),
		attributes: attrs,
		statusCode: StatusUnset,
	}
	t.mu.Lock()
	t.spans = append(t.spans, sb)
	t.mu.Unlock()
	return sb
}

// StartChild begins a child span under a parent.
func (t *Tracer) StartChild(parent *SpanBuilder, name string, kind string, attrs map[string]any) *SpanBuilder {
	sb := t.Start(name, kind, attrs)
	if parent != nil {
		sb.parentSpanID = parent.spanID
	}
	return sb
}

// Flush writes all spans to the database. Call once after all processing.
func (t *Tracer) Flush() {
	t.mu.Lock()
	spans := make([]*SpanBuilder, len(t.spans))
	copy(spans, t.spans)
	t.mu.Unlock()

	for _, sb := range spans {
		sb.mu.Lock()
		if sb.endTime == 0 {
			sb.endTime = time.Now().UnixMilli()
		}

		attrsJSON, _ := json.Marshal(sb.attributes)
		eventsJSON, _ := json.Marshal(sb.events)

		_, _ = t.db.Exec(`INSERT INTO trace_spans
			(trace_id, span_id, parent_span_id, name, kind, status_code, status_message, start_time, end_time, attributes, events, bot_id)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
			t.traceID, sb.spanID, sb.parentSpanID, sb.name, sb.kind,
			sb.statusCode, sb.statusMessage, sb.startTime, sb.endTime,
			attrsJSON, eventsJSON, t.botID)
		sb.mu.Unlock()
	}
}

// AppendSpan adds a span to an existing trace as a child of the root span.
func (db *DB) AppendSpan(traceID, botID, name, kind, statusCode, statusMessage string, attrs map[string]any) error {
	// Find root span to use as parent
	var parentSpanID string
	_ = db.QueryRow("SELECT span_id FROM trace_spans WHERE trace_id=$1 AND parent_span_id='' LIMIT 1", traceID).Scan(&parentSpanID)

	attrsJSON, _ := json.Marshal(attrs)
	now := time.Now().UnixMilli()
	_, err := db.Exec(`INSERT INTO trace_spans
		(trace_id, span_id, parent_span_id, name, kind, status_code, status_message, start_time, end_time, attributes, events, bot_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,'[]',$10)`,
		traceID, genSpanID(), parentSpanID, name, kind, statusCode, statusMessage, now, attrsJSON, botID)
	return err
}

// SpanBuilder builds a span with fluent API.
type SpanBuilder struct {
	mu            sync.Mutex
	tracer        *Tracer
	spanID        string
	parentSpanID  string
	name          string
	kind          string
	startTime     int64
	endTime       int64
	statusCode    string
	statusMessage string
	attributes    map[string]any
	events        []SpanEvent
}

func (sb *SpanBuilder) SpanID() string { return sb.spanID }

// SetAttr sets a single attribute.
func (sb *SpanBuilder) SetAttr(key string, value any) *SpanBuilder {
	sb.mu.Lock()
	defer sb.mu.Unlock()
	if sb.attributes == nil {
		sb.attributes = map[string]any{}
	}
	sb.attributes[key] = value
	return sb
}

// SetStatus sets the span status.
func (sb *SpanBuilder) SetStatus(code, message string) *SpanBuilder {
	sb.mu.Lock()
	defer sb.mu.Unlock()
	sb.statusCode = code
	sb.statusMessage = message
	return sb
}

// AddEvent adds a timestamped event to the span.
func (sb *SpanBuilder) AddEvent(name string, attrs map[string]any) *SpanBuilder {
	sb.mu.Lock()
	defer sb.mu.Unlock()
	sb.events = append(sb.events, SpanEvent{
		Name:       name,
		Timestamp:  time.Now().UnixMilli(),
		Attributes: attrs,
	})
	return sb
}

// End closes the span and records the end time.
func (sb *SpanBuilder) End() {
	sb.mu.Lock()
	defer sb.mu.Unlock()
	sb.endTime = time.Now().UnixMilli()
	if sb.statusCode == StatusUnset {
		sb.statusCode = StatusOK
	}
}

// EndWithError closes the span with error status.
func (sb *SpanBuilder) EndWithError(err string) {
	sb.mu.Lock()
	defer sb.mu.Unlock()
	sb.endTime = time.Now().UnixMilli()
	sb.statusCode = StatusError
	sb.statusMessage = err
}

// ListRootSpans returns recent root spans (parent_span_id = '') for a bot.
func (db *DB) ListRootSpans(botID string, limit int) ([]TraceSpan, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := db.Query(fmt.Sprintf(`SELECT id, trace_id, span_id, parent_span_id, name, kind,
		status_code, status_message, start_time, end_time, attributes, events, bot_id,
		EXTRACT(EPOCH FROM created_at)::BIGINT
		FROM trace_spans WHERE bot_id = $1 AND parent_span_id = ''
		ORDER BY id DESC LIMIT %d`, limit), botID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanSpans(rows)
}

// ListSpansByTrace returns all spans for a trace, ordered by start_time.
func (db *DB) ListSpansByTrace(traceID string) ([]TraceSpan, error) {
	rows, err := db.Query(`SELECT id, trace_id, span_id, parent_span_id, name, kind,
		status_code, status_message, start_time, end_time, attributes, events, bot_id,
		EXTRACT(EPOCH FROM created_at)::BIGINT
		FROM trace_spans WHERE trace_id = $1
		ORDER BY start_time`, traceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanSpans(rows)
}

func scanSpans(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
}) ([]TraceSpan, error) {
	var spans []TraceSpan
	for rows.Next() {
		var s TraceSpan
		var attrsJSON, eventsJSON json.RawMessage
		if err := rows.Scan(&s.ID, &s.TraceID, &s.SpanID, &s.ParentSpanID, &s.Name, &s.Kind,
			&s.StatusCode, &s.StatusMessage, &s.StartTime, &s.EndTime,
			&attrsJSON, &eventsJSON, &s.BotID, &s.CreatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(attrsJSON, &s.Attributes)
		_ = json.Unmarshal(eventsJSON, &s.Events)
		spans = append(spans, s)
	}
	return spans, rows.Err()
}
