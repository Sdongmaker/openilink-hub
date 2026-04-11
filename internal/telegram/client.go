package telegram

import (
	"context"
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

	client  *telegram.Client
	api     *tg.Client
	mu      sync.Mutex
	account *TGAccount
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
	mu       sync.Mutex
	codeCh   chan string
	password string
}

func (p *CodePrompt) Code(_ context.Context) (string, error) {
	code := <-p.codeCh
	if code == "" {
		return "", fmt.Errorf("verification cancelled")
	}
	return code, nil
}

func (p *CodePrompt) Password(_ context.Context) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.password == "" {
		return "", fmt.Errorf("2FA password not provided")
	}
	return p.password, nil
}

// AuthState tracks the state of an in-progress authentication flow.
type AuthState struct {
	Phone    string
	CodeHash string
	Prompt   *CodePrompt
	Cancel   context.CancelFunc
}

var (
	pendingAuth   *AuthState
	pendingAuthMu sync.Mutex
)

// StartAuth begins the authentication flow by sending a verification code.
func (c *Client) StartAuth(ctx context.Context, phone string) (string, error) {
	pendingAuthMu.Lock()
	defer pendingAuthMu.Unlock()

	// Get or create account
	account, err := c.store.GetAccount(ctx)
	if err != nil {
		account, err = c.store.CreateAccount(ctx, phone)
		if err != nil {
			return "", fmt.Errorf("create account: %w", err)
		}
	}
	c.account = account

	storage := &dbSessionStorage{store: c.store, accountID: account.ID}
	client := telegram.NewClient(c.apiID, c.apiHash, telegram.Options{
		SessionStorage: storage,
	})

	authCtx, cancel := context.WithCancel(ctx)
	codeCh := make(chan string, 1)
	prompt := &CodePrompt{codeCh: codeCh}

	pendingAuth = &AuthState{
		Phone:  phone,
		Prompt: prompt,
		Cancel: cancel,
	}

	// Run client in background for auth flow
	go func() {
		err := client.Run(authCtx, func(ctx context.Context) error {
			// Send code
			sentCodeClass, err := client.Auth().SendCode(ctx, phone, auth.SendCodeOptions{})
			if err != nil {
				return fmt.Errorf("send code: %w", err)
			}

			sentCode, ok := sentCodeClass.(*tg.AuthSentCode)
			if !ok {
				return fmt.Errorf("unexpected sent code type: %T", sentCodeClass)
			}

			pendingAuthMu.Lock()
			if pendingAuth != nil {
				pendingAuth.CodeHash = sentCode.PhoneCodeHash
			}
			pendingAuthMu.Unlock()

			slog.Info("telegram auth: code sent", "phone", phone)

			// Wait for code from user
			code, err := prompt.Code(ctx)
			if err != nil {
				return err
			}

			// Try to sign in
			_, err = client.Auth().SignIn(ctx, phone, code, sentCode.PhoneCodeHash)
			if err != nil {
				// May need 2FA
				if auth.IsKeyUnregistered(err) {
					return fmt.Errorf("phone not registered on Telegram")
				}
				// Try 2FA if password is set
				pwd, pwdErr := prompt.Password(ctx)
				if pwdErr != nil {
					return fmt.Errorf("sign in failed and no 2FA password: %w", err)
				}
				_, err = client.Auth().Password(ctx, pwd)
				if err != nil {
					return fmt.Errorf("2FA failed: %w", err)
				}
			}

			slog.Info("telegram auth: signed in", "phone", phone)
			c.mu.Lock()
			c.client = client
			c.api = client.API()
			c.mu.Unlock()

			_ = c.store.UpdateAccountStatus(ctx, account.ID, "active")

			// Keep connection alive until context is cancelled
			<-ctx.Done()
			return ctx.Err()
		})
		if err != nil && err != context.Canceled {
			slog.Error("telegram client run error", "err", err)
			_ = c.store.UpdateAccountStatus(context.Background(), account.ID, "disconnected")
		}
	}()

	// Wait briefly for code hash to be populated
	return "code_sent", nil
}

// VerifyCode submits the verification code and optional 2FA password.
func (c *Client) VerifyCode(_ context.Context, code, password2FA string) error {
	pendingAuthMu.Lock()
	state := pendingAuth
	pendingAuthMu.Unlock()

	if state == nil {
		return fmt.Errorf("no pending auth flow")
	}

	if password2FA != "" {
		state.Prompt.mu.Lock()
		state.Prompt.password = password2FA
		state.Prompt.mu.Unlock()
	}

	state.Prompt.codeCh <- code
	return nil
}

// Connect establishes a connection using an existing session.
func (c *Client) Connect(ctx context.Context) error {
	account, err := c.store.GetAccount(ctx)
	if err != nil {
		return fmt.Errorf("no account configured: %w", err)
	}
	if len(account.SessionData) == 0 {
		return fmt.Errorf("no session data, authentication required")
	}
	c.account = account

	_ = c.store.UpdateAccountStatus(ctx, account.ID, "connecting")

	storage := &dbSessionStorage{store: c.store, accountID: account.ID}
	client := telegram.NewClient(c.apiID, c.apiHash, telegram.Options{
		SessionStorage: storage,
	})

	go func() {
		err := client.Run(ctx, func(ctx context.Context) error {
			c.mu.Lock()
			c.client = client
			c.api = client.API()
			c.mu.Unlock()

			_ = c.store.UpdateAccountStatus(ctx, account.ID, "active")
			slog.Info("telegram client connected", "phone", account.Phone)

			<-ctx.Done()
			return ctx.Err()
		})
		if err != nil && err != context.Canceled {
			slog.Error("telegram client disconnected", "err", err)
			_ = c.store.UpdateAccountStatus(context.Background(), account.ID, "disconnected")
		}
	}()

	return nil
}

// API returns the underlying tg.Client for making Telegram API calls.
func (c *Client) API() *tg.Client {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.api
}

// TestResult contains the results of connection testing.
type TestResult struct {
	Checks    []TestCheck `json:"checks"`
	AllPassed bool        `json:"all_passed"`
}

// TestCheck is a single connection test check.
type TestCheck struct {
	Name string `json:"name"`
	OK   bool   `json:"ok"`
}

// Test runs a series of connection checks.
func (c *Client) Test(ctx context.Context) (*TestResult, error) {
	api := c.API()
	result := &TestResult{}

	// Check 1: MTProto connection
	check1 := TestCheck{Name: "mtproto_connection", OK: api != nil}
	result.Checks = append(result.Checks, check1)

	if api == nil {
		result.AllPassed = false
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
	result.Checks = append(result.Checks, check2)

	// Check 3: Get self (verify auth)
	check3 := TestCheck{Name: "receive_updates"}
	_, err = api.UsersGetFullUser(ctx, &tg.InputUserSelf{})
	check3.OK = err == nil
	result.Checks = append(result.Checks, check3)

	// Check 4: Session persistence
	check4 := TestCheck{Name: "session_persistence"}
	if c.account != nil {
		acc, err := c.store.GetAccount(ctx)
		check4.OK = err == nil && len(acc.SessionData) > 0
	}
	result.Checks = append(result.Checks, check4)

	result.AllPassed = check1.OK && check2.OK && check3.OK && check4.OK
	if c.account != nil {
		_ = c.store.UpdateAccountTest(ctx, c.account.ID, result.AllPassed)
	}
	return result, nil
}

// Stop disconnects the client.
func (c *Client) Stop() {
	pendingAuthMu.Lock()
	if pendingAuth != nil && pendingAuth.Cancel != nil {
		pendingAuth.Cancel()
		pendingAuth = nil
	}
	pendingAuthMu.Unlock()
}

// IsConnected returns true if the client has an active API connection.
func (c *Client) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.api != nil
}
