FROM mcr.microsoft.com/devcontainers/javascript-node:20

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      git \
      git-lfs \
      jq \
      yq \
      poppler-utils \
      qpdf \
      python3 \
      python3-pip \
      curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -Lo /usr/local/bin/pup https://github.com/ericchiang/pup/releases/download/v0.4.0/pup-linux-amd64 \
    && chmod +x /usr/local/bin/pup

RUN git lfs install --system

WORKDIR /workspace/article6-methodologies
