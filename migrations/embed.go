// Package migrations embeds the append-only SQL migrations.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
