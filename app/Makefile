# Build and push the workshop sample-app image.
#
# Mirrors .github/workflows/build-image.yml: same image coordinate, same two
# tags ($(TAG) + git SHA), same platforms, same Dockerfile/context. The
# canonical coordinate is docker.io/altf4llc/fem-kubernetes:v1 (TDD §4).
#
# `make push` assumes you are already authenticated to the registry. Either run
# `make login` first (with DOCKERHUB_USERNAME + DOCKERHUB_TOKEN exported) or use
# whatever credentials your local `docker login` already holds.

IMAGE     ?= docker.io/altf4llc/fem-kubernetes
TAG       ?= v1
PLATFORMS ?= linux/amd64,linux/arm64
BUILDER   ?= fem-kubernetes-builder
GIT_SHA   := $(shell git rev-parse HEAD)

.DEFAULT_GOAL := help
.PHONY: help push ensure-builder build login

help:
	@echo "Targets:"
	@echo "  push           Build $(PLATFORMS) and push $(IMAGE):$(TAG) + $(IMAGE):<git-sha>"
	@echo "  build          Build single-arch (host) and load into the local daemon for testing"
	@echo "  ensure-builder Create/use the multi-platform buildx builder ($(BUILDER))"
	@echo "  login          docker login using DOCKERHUB_USERNAME + DOCKERHUB_TOKEN"
	@echo "  help           Show this help (default)"

# Multi-arch build + push. A multi-platform build cannot --load into the local
# daemon (the daemon holds one architecture); --push to the registry is the only
# valid output for a multi-platform image. Tags both $(TAG) and the full git SHA,
# mirroring the CI workflow's per-commit escape-hatch tag.
push: ensure-builder
	docker buildx build \
		--builder $(BUILDER) \
		--platform $(PLATFORMS) \
		-t $(IMAGE):$(TAG) \
		-t $(IMAGE):$(GIT_SHA) \
		--push \
		.

# Idempotently ensure a docker-container-driver buildx builder exists; multi-arch
# builds require this driver (the default "docker" driver is single-platform).
ensure-builder:
	docker buildx inspect $(BUILDER) >/dev/null 2>&1 || \
		docker buildx create --name $(BUILDER) --driver docker-container --bootstrap

# Single-arch on purpose: builds for the current host architecture and loads the
# result into the local daemon for quick local testing (e.g. `docker run`).
build:
	docker build -t $(IMAGE):$(TAG) .

# Convenience login mirroring the CI secrets. Reads the token from stdin so it
# never lands in shell history or the process table. `push` does NOT depend on
# this — run it yourself when you need to authenticate.
login:
	@echo "$(DOCKERHUB_TOKEN)" | docker login -u "$(DOCKERHUB_USERNAME)" --password-stdin
