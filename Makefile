BUN := bun:1.3.10
MARP := vorpal run $(BUN) x @marp-team/marp-cli@4.4.0
MMDC := vorpal run $(BUN) x @mermaid-js/mermaid-cli@11.15.0

MMD_SOURCES := $(wildcard docs/workshop/diagrams/*.mmd)
SVG_TARGETS := $(patsubst docs/workshop/diagrams/%.mmd,img/diagrams/%.svg,$(MMD_SOURCES))
PNG_TARGETS := $(patsubst docs/workshop/diagrams/%.mmd,img/diagrams/%.png,$(MMD_SOURCES))

.PHONY: build diagrams slides diagrams-png clean

build: diagrams slides

diagrams: $(SVG_TARGETS)

img/diagrams/%.svg: docs/workshop/diagrams/%.mmd docs/workshop/diagrams/mermaid.json
	@mkdir -p img/diagrams
	$(MMDC) -i $< -o $@ -b transparent --configFile docs/workshop/diagrams/mermaid.json

slides: dist/slides.html

dist/slides.html: docs/workshop/slides.md docs/workshop/themes/workshop.css $(SVG_TARGETS)
	@mkdir -p dist/img
	$(MARP) docs/workshop/slides.md -o dist/slides.html --theme-set docs/workshop/themes/workshop.css --html
	rm -rf dist/img/diagrams
	cp -R img/diagrams dist/img/diagrams

diagrams-png: $(PNG_TARGETS)

img/diagrams/%.png: docs/workshop/diagrams/%.mmd docs/workshop/diagrams/mermaid.json
	@mkdir -p img/diagrams
	$(MMDC) -i $< -o $@ -s 2 -b transparent --configFile docs/workshop/diagrams/mermaid.json

clean:
	rm -rf dist img/diagrams/*.svg
