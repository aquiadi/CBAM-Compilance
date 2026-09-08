# CarbonPass AI - developer entry points.
#
# Every target here is the same command CI runs, so "it passes locally" and
# "it passes in CI" mean the same thing.

SHELL := /bin/bash
.DEFAULT_GOAL := help

IMAGE ?= carbonpass-ai
TAG   ?= local
PORT  ?= 3000

.PHONY: help install dev build start check lint format test test-watch eval eval-model \
        seed data-verify screenshots docker-build docker-run docker-stop clean reset

help: ## Show this help
	@echo "CarbonPass AI"
	@echo
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "Vars: IMAGE=$(IMAGE) TAG=$(TAG) PORT=$(PORT)"

install: ## Install dependencies from the lockfile
	npm ci

dev: ## Run the dev server (seeds the demo dataset on first request)
	npm run dev

build: ## Production build
	npm run build

start: ## Serve the production build
	npm run start

check: ## Everything CI runs: lint, format, types, data, tests, eval
	npm run check

lint: ## ESLint
	npm run lint

format: ## Rewrite files with Prettier
	npm run format

test: ## Unit and architecture tests
	npm run test

test-watch: ## Tests in watch mode
	npm run test:watch

eval: ## Mapping eval, deterministic baseline
	npm run eval

eval-model: ## Mapping eval including the LLM mapper (needs an API key)
	npm run eval:model

seed: ## Regenerate the demo fixtures, then refresh their manifest
	npm run seed && npm run data:manifest

data-verify: ## Check the demo fixtures still match their checksums
	npm run data:verify

screenshots: ## Capture every screen (needs a dev server on $(PORT))
	BASE_URL=http://localhost:$(PORT) npm run screenshots

docker-build: ## Build the container image
	docker build -t $(IMAGE):$(TAG) .

docker-run: ## Run the image on $(PORT)
	docker run --rm -d --name $(IMAGE) -p $(PORT):3000 \
		-e ANTHROPIC_API_KEY=$${ANTHROPIC_API_KEY:-} $(IMAGE):$(TAG)
	@echo "http://localhost:$(PORT)"

docker-stop: ## Stop the running container
	-docker stop $(IMAGE)

reset: ## Discard workspace state and reseed the demo on next request
	rm -rf .data

clean: ## Remove build output, state and artifacts
	rm -rf .next .data artifacts node_modules/.cache *.tsbuildinfo
