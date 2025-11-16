# Use the official base image for dev containers
FROM mcr.microsoft.com/devcontainers/javascript-node:20

# Set non-interactive mode to avoid prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install required packages including Docker
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    git-lfs \
    jq \
    yq \
    poppler-utils \
    qpdf \
    python3 \
    python3-pip \
    pup \
    docker.io \
  && rm -rf /var/lib/apt/lists/*  # Clean up apt cache to reduce image size

# Enable Docker service (ensure the Docker daemon is running)
RUN systemctl enable docker

# Initialize Git LFS
RUN git lfs install --system

# Set working directory for the container
WORKDIR /workspaces/article6-methodologies
