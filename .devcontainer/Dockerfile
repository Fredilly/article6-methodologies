# Devcontainer image for article6-methodologies
FROM mcr.microsoft.com/devcontainers/javascript-node:20

# Pin pup version
ARG PUP_VERSION=0.4.0

# Non-interactive apt, expose pup version
ENV DEBIAN_FRONTEND=noninteractive \
    PUP_VERSION=${PUP_VERSION}

# Base tooling for ingest + sanity (including Docker)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      build-essential \
      curl \
      git \
      git-lfs \
      golang-go \
      jq \
      ripgrep \
      yq \
      poppler-utils \
      qpdf \
      unzip \
      python3 \
      python3-pip \
      docker.io \
    && rm -rf /var/lib/apt/lists/*

# Install pup via Go (pinned)
RUN GOBIN=/usr/local/bin GO111MODULE=on go install "github.com/ericchiang/pup@v${PUP_VERSION}" \
    && pup --version

# Git LFS + repo safety
RUN git lfs install --system
RUN git config --system --add safe.directory /workspaces/article6-methodologies

# Default workdir
WORKDIR /workspaces/article6-methodologies

