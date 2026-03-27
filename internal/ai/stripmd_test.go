package ai

import (
	"testing"
)

func TestStripMarkdown(t *testing.T) {
	cases := []struct {
		name  string
		input string
		want  string
	}{
		{"bold", "**hello**", "hello"},
		{"italic star", "*hello*", "hello"},
		{"italic underscore", "_hello_", "hello"},
		{"bold underscore", "__hello__", "hello"},
		{"atx header", "# Hello World", "Hello World"},
		{"atx header h2", "## Hello", "Hello"},
		{"inline code", "`code`", "code"},
		{"code block", "```\ncode\n```", ""},
		{"link", "[text](http://example.com)", "text"},
		{"image", "![alt](http://example.com/img.png)", "alt"},
		{"blockquote", "> quote", "  quote"},
		{"strikethrough", "~~text~~", "text"},
		{"unordered list", "- item", "item"},
		{"numbered list", "1. item", "item"},
		{"plain text unchanged", "hello world", "hello world"},
		// Underscore in identifiers must not be mangled
		{"snake_case preserved", "use set_config_value here", "use set_config_value here"},
		{"env var preserved", "set ENV_VAR_NAME=1", "set ENV_VAR_NAME=1"},
		{"dunder in prose stripped (valid bold)", "call __init__ method", "call init method"},
		// Horizontal rule handled by reSetext
		{"horizontal rule", "---", ""},
		// Setext heading underline
		{"setext heading", "Title\n---", "Title\n"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := StripMarkdown(c.input)
			if got != c.want {
				t.Errorf("StripMarkdown(%q) = %q, want %q", c.input, got, c.want)
			}
		})
	}
}
