FROM mcr.microsoft.com/devcontainers/base:ubuntu

ARG NODE_VERSION=20
ARG PUP_VERSION=0.4.0

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_VERSION=${NODE_VERSION} \
    PUP_VERSION=${PUP_VERSION}

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
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x via NodeSource, enable Corepack for pnpm/yarn parity.
RUN curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g corepack \
    && corepack enable \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*

RUN GOBIN=/usr/local/bin GO111MODULE=on go install "github.com/ericchiang/pup@v${PUP_VERSION}" \
    && pup --version

RUN git lfs install --system
RUN git config --system --add safe.directory /workspaces/article6-methodologies

WORKDIR /workspaces/article6-methodologies
