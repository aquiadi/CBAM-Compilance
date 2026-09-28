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
        seed data-verify regulatory smoke screenshots docker-build docker-run docker-stop \
        compose-up compose-down clean reset

help: ## Show this help
	@echo "CarbonPass AI"
	@echo
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "Vars: IMAGE=$(IMAGE) TAG=$(TAG) PORT=$(PORT)"

install: ## Install dependencies from the lockfile
	npm ci

dev: ## Run the dev server (embedded database under .data unless DATABASE_URL is set)
	npm run dev

build: ## Production build
	npm run build

start: ## Serve the production build the way the container does
	npm run start:standalone

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

regulatory: ## Rebuild the engine's tables from the Commission workbooks in data/regulatory/source
	npm run regulatory:import

smoke: ## End-to-end test over HTTP (needs a server on $(PORT))
	BASE_URL=http://localhost:$(PORT) npm run smoke

screenshots: ## Capture every screen (needs a server on $(PORT))
	BASE_URL=http://localhost:$(PORT) npm run screenshots

docker-build: ## Build the container image
	docker build -t $(IMAGE):$(TAG) .

docker-run: ## Run the image on $(PORT) with the embedded database in a named volume
	docker run --rm -d --name $(IMAGE) -p $(PORT):3000 -v $(IMAGE)-data:/app/.data \
		-e ANTHROPIC_API_KEY=$${ANTHROPIC_API_KEY:-} -e GROQ_API_KEY=$${GROQ_API_KEY:-} $(IMAGE):$(TAG)
	@echo "http://localhost:$(PORT)"

docker-stop: ## Stop the running container
	-docker stop $(IMAGE)

compose-up: ## Run the app with a Postgres database (docker compose)
	docker compose up --build -d
	@echo "http://localhost:$(PORT)"

compose-down: ## Stop the compose stack (data volumes are kept)
	docker compose down

reset: ## Delete the embedded database (every account and workspace)
	rm -rf .data

clean: ## Remove build output, state and artifacts
	rm -rf .next .data artifacts node_modules/.cache *.tsbuildinfo
