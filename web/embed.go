// Package web embeds the built frontend so production runs as one binary.
package web

import "embed"

// Dist holds the Vite output. A committed .gitkeep keeps it compilable before the first build.
//
//go:embed all:dist
var Dist embed.FS
