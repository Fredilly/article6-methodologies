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
      pup \
    && rm -rf /var/lib/apt/lists/*

RUN git lfs install --system

WORKDIR /workspaces/article6-methodologies
