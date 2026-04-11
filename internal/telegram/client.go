package telegram

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"

	"github.com/gotd/td/session"
	"github.com/gotd/td/telegram"
	"github.com/gotd/td/telegram/auth"
	"github.com/gotd/td/tg"
)

// Client wraps the gotd/td MTProto client.
type Client struct {
	apiID   int
	apiHash string
	store   *Store

	mu        sync.RWMutex
	client    *telegram.Client
	api       *tg.Client
	account   *TGAccount
	runID     uint64
	runCancel context.CancelFunc
	authState *AuthState
}

// NewClient creates a new Telegram MTProto client wrapper.
func NewClient(apiID int, apiHash string, store *Store) *Client {
	return &Client{
		apiID:   apiID,
		apiHash: apiHash,
		store:   store,
	}
}

// dbSessionStorage implements session.Storage backed by the database.
type dbSessionStorage struct {
	store     *Store
	accountID int64
}

func (d *dbSessionStorage) LoadSession(_ context.Context) ([]byte, error) {
	acc, err := d.store.GetAccount(context.Background())
	if err != nil {
		return nil, session.ErrNotFound
	}
	if len(acc.SessionData) == 0 {
		return nil, session.ErrNotFound
	}
	return acc.SessionData, nil
}

func (d *dbSessionStorage) StoreSession(_ context.Context, data []byte) error {
	return d.store.UpdateAccountSession(context.Background(), d.accountID, data)
}

// CodePrompt holds the state for interactive code verification.
type CodePrompt struct {
	codeCh     chan string
	passwordCh chan string
}

func newCodePrompt() *CodePrompt {
	return &CodePrompt{
		codeCh:     make(chan string, 1),
		passwordCh: make(chan string, 1),
	}
}

func (p *CodePrompt) Code(ctx context.Context) (string, error) {
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case code := <-p.codeCh:
		if code == "" {
			return "", fmt.Errorf("verification cancelled")
		}
		return code, nil
	}
}

func (p *CodePrompt) Password(ctx context.Context) (string, error) {
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case password := <-p.passwordCh:
		if password == "" {
			return "", fmt.Errorf("2FA password not provided")
		}
		return password, nil
	}
}

func (p *CodePrompt) SubmitCode(code string) {
	select {
	case <-p.codeCh:
	default:
	}
	select {
	case p.codeCh <- code:
	default:
	}
}

func (p *CodePrompt) SubmitPassword(password string) {
	select {
	case <-p.passwordCh:
	default:
	}
	select {
	case p.passwordCh <- password:
	default:
	}
}

// AuthState tracks the state of an in-progress authentication flow.
type AuthState struct {
	Phone            string
	CodeHash         string
	Prompt           *CodePrompt
	Cancel           context.CancelFunc
	passwordRequired chan struct{}
	resultCh         chan error

	mu                   sync.Mutex
	codeSubmitted        bool
	passwordRequiredSent bool
	resultOnce           sync.Once
}

var ErrPasswordRequired = errors.New("2FA password required")

func newAuthState(phone string, cancel context.CancelFunc) *AuthState {
	return &AuthState{
		Phone:            phone,
		Prompt:           newCodePrompt(),
		Cancel:           cancel,
		passwordRequired: make(chan struct{}),
		resultCh:         make(chan error, 1),
	}
}

func (s *AuthState) markCodeSubmitted() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.codeSubmitted {
		return false
	}
	s.codeSubmitted = true
	return true
}

func (s *AuthState) signalPasswordRequired() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.passwordRequiredSent {
		return
	}
	s.passwordRequiredSent = true
	close(s.passwordRequired)
}

func (s *AuthState) finish(err error) {
	s.resultOnce.Do(func() {
		s.resultCh <- err
	})
}

// StartAuth begins the authentication flow by sending a verification code.
func (c *Client) StartAuth(ctx context.Context, phone string) (string, error) {
	c.mu.Lock()
	if c.authState != nil {
		c.mu.Unlock()
		return "", fmt.Errorf("authentication already in progress")
	}
	if c.runCancel != nil {
		c.runCancel()
		c.runCancel = nil
		c.client = nil
		c.api = nil
	}
	c.mu.Unlock()

	// Get or create account
	account, err := c.store.GetAccount(ctx)
	if err != nil {
		account, err = c.store.CreateAccount(ctx, phone)
		if err != nil {
			return "", fmt.Errorf("create account: %w", err)
		}
	} else if account.Phone != phone {
		return "", fmt.Errorf("another Telegram account is already configured")
	}
	_ = c.store.UpdateAccountStatus(ctx, account.ID, "auth_required")

	c.mu.Lock()
	c.account = account
	c.mu.Unlock()

	storage := &dbSessionStorage{store: c.store, accountID: account.ID}
	client := telegram.NewClient(c.apiID, c.apiHash, telegram.Options{
		SessionStorage: storage,
	})

	runCtx, cancel := context.WithCancel(context.Background())
	state := newAuthState(phone, cancel)
	readyCh := make(chan error, 1)
	var readyOnce sync.Once
	notifyReady := func(err error) {
		readyOnce.Do(func() {
			readyCh <- err
		})
	}

	c.mu.Lock()
	c.runID++
	runID := c.runID
	c.runCancel = cancel
	c.authState = state
	c.mu.Unlock()

	// Run client in background for auth flow
	go func() {
		err := client.Run(runCtx, func(inner context.Context) error {
			// Send code
			sentCodeClass, err := client.Auth().SendCode(inner, phone, auth.SendCodeOptions{})
			if err != nil {
				notifyReady(fmt.Errorf("send code: %w", err))
				state.finish(fmt.Errorf("send code: %w", err))
				return fmt.Errorf("send code: %w", err)
			}

			sentCode, ok := sentCodeClass.(*tg.AuthSentCode)
			if !ok {
				err := fmt.Errorf("unexpected sent code type: %T", sentCodeClass)
				notifyReady(err)
				state.finish(err)
				return err
			}

			state.CodeHash = sentCode.PhoneCodeHash
			notifyReady(nil)

			slog.Info("telegram auth: code sent", "phone", phone)

			// Wait for code from user
			code, err := state.Prompt.Code(inner)
			if err != nil {
				state.finish(err)
				return err
			}

			// Try to sign in
			_, err = client.Auth().SignIn(inner, phone, code, sentCode.PhoneCodeHash)
			if err != nil {
				if auth.IsKeyUnregistered(err) {
					wrapped := fmt.Errorf("phone not registered on Telegram")
					state.finish(wrapped)
					return wrapped
				}
				if errors.Is(err, auth.ErrPasswordAuthNeeded) {
					state.signalPasswordRequired()

					pwd, pwdErr := state.Prompt.Password(inner)
					if pwdErr != nil {
						state.finish(pwdErr)
						return pwdErr
					}

					_, err = client.Auth().Password(inner, pwd)
					if err != nil {
						state.finish(err)
						return fmt.Errorf("2FA failed: %w", err)
					}
				} else {
					state.finish(err)
					return err
				}
			}

			slog.Info("telegram auth: signed in", "phone", phone)
			c.mu.Lock()
			c.client = client
			c.api = client.API()
			c.account = account
			c.mu.Unlock()

			_ = c.store.UpdateAccountStatus(inner, account.ID, "active")
			state.finish(nil)
			c.clearAuthState(state)

			// Keep connection alive until context is cancelled
			<-inner.Done()
			return inner.Err()
		})
		if err != nil && err != context.Canceled {
			slog.Error("telegram client run error", "err", err)
			_ = c.store.UpdateAccountStatus(context.Background(), account.ID, "disconnected")
		}
		c.clearAuthState(state)
		c.clearRuntime(client, runID)
	}()

	select {
	case err := <-readyCh:
		if err != nil {
			c.clearAuthState(state)
			return "", err
		}
		return "code_sent", nil
	case <-ctx.Done():
		cancel()
		c.clearAuthState(state)
		return "", ctx.Err()
	}
}

// VerifyCode submits the verification code and optional 2FA password.
func (c *Client) VerifyCode(ctx context.Context, code, password2FA string) error {
	c.mu.RLock()
	state := c.authState
	c.mu.RUnlock()

	if state == nil {
		return fmt.Errorf("no pending auth flow")
	}

	if code != "" && state.markCodeSubmitted() {
		state.Prompt.SubmitCode(code)
	}
	if password2FA != "" {
		state.Prompt.SubmitPassword(password2FA)
	}

	if password2FA != "" {
		select {
		case err := <-state.resultCh:
			return err
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	select {
	case err := <-state.resultCh:
		return err
	case <-state.passwordRequired:
		return ErrPasswordRequired
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Connect establishes a connection using an existing session.
func (c *Client) Connect(ctx context.Context) error {
	if c.IsConnected() {
		return nil
	}

	account, err := c.store.GetAccount(ctx)
	if err != nil {
		return fmt.Errorf("no account configured: %w", err)
	}
	if len(account.SessionData) == 0 {
		return fmt.Errorf("no session data, authentication required")
	}
	c.mu.Lock()
	c.account = account
	c.mu.Unlock()

	_ = c.store.UpdateAccountStatus(ctx, account.ID, "connecting")

	storage := &dbSessionStorage{store: c.store, accountID: account.ID}
	client := telegram.NewClient(c.apiID, c.apiHash, telegram.Options{
		SessionStorage: storage,
	})
	runCtx, cancel := context.WithCancel(context.Background())
	readyCh := make(chan error, 1)
	var readyOnce sync.Once
	notifyReady := func(err error) {
		readyOnce.Do(func() {
			readyCh <- err
		})
	}

	c.mu.Lock()
	if c.runCancel != nil {
		c.runCancel()
	}
	c.runID++
	runID := c.runID
	c.runCancel = cancel
	c.mu.Unlock()

	go func() {
		err := client.Run(runCtx, func(inner context.Context) error {
			c.mu.Lock()
			c.client = client
			c.api = client.API()
			c.account = account
			c.mu.Unlock()

			_ = c.store.UpdateAccountStatus(inner, account.ID, "active")
			notifyReady(nil)
			slog.Info("telegram client connected", "phone", account.Phone)

			<-inner.Done()
			return inner.Err()
		})
		if err != nil && err != context.Canceled {
			notifyReady(err)
			slog.Error("telegram client disconnected", "err", err)
			_ = c.store.UpdateAccountStatus(context.Background(), account.ID, "disconnected")
		}
		c.clearRuntime(client, runID)
	}()

	select {
	case err := <-readyCh:
		if err != nil {
			cancel()
			return fmt.Errorf("connect telegram client: %w", err)
		}
		return nil
	case <-ctx.Done():
		cancel()
		return ctx.Err()
	}
}

// API returns the underlying tg.Client for making Telegram API calls.
func (c *Client) API() *tg.Client {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.api
}

// TestResult contains the results of connection testing.
type TestResult struct {
	Checks  []TestCheck `json:"checks"`
	Overall bool        `json:"overall"`
}

// TestCheck is a single connection test check.
type TestCheck struct {
	Name  string `json:"name"`
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// Test runs a series of connection checks.
func (c *Client) Test(ctx context.Context) (*TestResult, error) {
	api := c.API()
	result := &TestResult{}

	// Check 1: MTProto connection
	check1 := TestCheck{Name: "mtproto_connection", OK: api != nil}
	if api == nil {
		check1.Error = "client not connected"
	}
	result.Checks = append(result.Checks, check1)

	if api == nil {
		result.Overall = false
		if c.account != nil {
			_ = c.store.UpdateAccountTest(ctx, c.account.ID, false)
		}
		return result, nil
	}

	// Check 2: Read chat list
	check2 := TestCheck{Name: "read_chat_list"}
	_, err := api.MessagesGetDialogs(ctx, &tg.MessagesGetDialogsRequest{
		Limit:      1,
		OffsetPeer: &tg.InputPeerEmpty{},
	})
	check2.OK = err == nil
	if err != nil {
		check2.Error = err.Error()
	}
	result.Checks = append(result.Checks, check2)

	// Check 3: Get self (verify auth)
	check3 := TestCheck{Name: "receive_updates"}
	_, err = api.UsersGetFullUser(ctx, &tg.InputUserSelf{})
	check3.OK = err == nil
	if err != nil {
		check3.Error = err.Error()
	}
	result.Checks = append(result.Checks, check3)

	// Check 4: Session persistence
	check4 := TestCheck{Name: "session_persistence"}
	if c.account != nil {
		acc, err := c.store.GetAccount(ctx)
		check4.OK = err == nil && len(acc.SessionData) > 0
		if err != nil {
			check4.Error = err.Error()
		} else if len(acc.SessionData) == 0 {
			check4.Error = "no persisted session data"
		}
	}
	result.Checks = append(result.Checks, check4)

	result.Overall = check1.OK && check2.OK && check3.OK && check4.OK
	if c.account != nil {
		_ = c.store.UpdateAccountTest(ctx, c.account.ID, result.Overall)
	}
	return result, nil
}

// Stop disconnects the client.
func (c *Client) Stop() {
	c.mu.Lock()
	cancel := c.runCancel
	state := c.authState
	account := c.account
	c.runCancel = nil
	c.authState = nil
	c.client = nil
	c.api = nil
	c.mu.Unlock()

	if state != nil {
		state.finish(context.Canceled)
		if state.Cancel != nil {
			state.Cancel()
		}
	}
	if cancel != nil {
		cancel()
	}
	if account != nil {
		status := "disconnected"
		if state != nil {
			status = "auth_required"
		}
		_ = c.store.UpdateAccountStatus(context.Background(), account.ID, status)
	}
}

// IsConnected returns true if the client has an active API connection.
func (c *Client) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.api != nil
}

func (c *Client) clearAuthState(state *AuthState) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.authState == state {
		c.authState = nil
	}
}

func (c *Client) clearRuntime(client *telegram.Client, runID uint64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.client == client {
		c.client = nil
		c.api = nil
	}
	if c.runID == runID {
		c.runCancel = nil
	}
}
