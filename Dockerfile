# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install system dependencies and Node.js dependencies
RUN apk add --no-cache wget && \
    npm ci

# Copy source code and configuration files
COPY src ./src
COPY config ./config
COPY public ./public
COPY tsconfig.json ./

# Create a non-root user for security
RUN addgroup -g 1001 -S plcuser && \
    adduser -S plcuser -u 1001

# Create data directory for SQLite database
RUN mkdir -p data

# Change ownership of the app directory
RUN chown -R plcuser:plcuser /app
USER plcuser

# Expose the application port
EXPOSE 8080

# Set default environment variables
ENV NODE_ENV=production
ENV PLC_CONFIG=config/example.yaml

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start the application
CMD ["node", "-r", "ts-node/register", "src/index.ts"]
