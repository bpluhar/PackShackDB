FROM node:18-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    chromaprint \
    chromaprint-dev \
    ffmpeg \
    ffmpeg-dev \
    build-base \
    python3 \
    make \
    g++ \
    pkgconfig \
    git \
    libc6-compat

# Set environment variables
ENV NODE_ENV=production
ENV PKG_CONFIG_PATH=/usr/lib/pkgconfig
ENV CPLUS_INCLUDE_PATH=/usr/include/chromaprint:$CPLUS_INCLUDE_PATH

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install node-gyp globally (required for compiling native modules)
RUN npm install -g node-gyp

# Install dependencies
RUN npm install --build-from-source --unsafe-perm

# Copy the rest of the application code
COPY . .

# Create audio-files directory and set permissions
RUN mkdir -p audio-files && \
    chown -R node:node /app

# Switch to non-root user
USER node

# Expose port 3001
EXPOSE 3001

# Run the app using the proper entry point (ensure server.js exists in the root)
CMD ["node", "server.js"]
