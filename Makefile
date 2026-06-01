BUN := bun:1.3.10
MARP := vorpal run $(BUN) x @marp-team/marp-cli@4.4.0
MMDC := vorpal run $(BUN) x @mermaid-js/mermaid-cli@11.15.0

MMD_SOURCES := $(wildcard diagrams/*.mmd)
SVG_TARGETS := $(patsubst diagrams/%.mmd,img/diagrams/%.svg,$(MMD_SOURCES))
PNG_TARGETS := $(patsubst diagrams/%.mmd,img/diagrams/%.png,$(MMD_SOURCES))

.PHONY: build diagrams slides diagrams-png clean

build: diagrams slides

diagrams: $(SVG_TARGETS)

img/diagrams/%.svg: diagrams/%.mmd diagrams/mermaid.json
	@mkdir -p img/diagrams
	$(MMDC) -i $< -o $@ -b transparent --configFile diagrams/mermaid.json

slides: dist/slides.html

dist/slides.html: slides.md themes/workshop.css $(SVG_TARGETS)
	@mkdir -p dist/img
	$(MARP) slides.md -o dist/slides.html --theme-set themes/workshop.css --html
	rm -rf dist/img/diagrams
	cp -R img/diagrams dist/img/diagrams

diagrams-png: $(PNG_TARGETS)

img/diagrams/%.png: diagrams/%.mmd diagrams/mermaid.json
	@mkdir -p img/diagrams
	$(MMDC) -i $< -o $@ -s 2 -b transparent --configFile diagrams/mermaid.json

clean:
	rm -rf dist img/diagrams/*.svg
