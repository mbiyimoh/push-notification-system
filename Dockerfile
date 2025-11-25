# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy the push-blaster service
COPY services/push-blaster/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY services/push-blaster/ ./

# Copy shared Python utilities (for audience generation scripts)
COPY shared/python-utilities/ ./shared/python-utilities/

# Ensure automations directory exists (may be empty initially)
RUN mkdir -p .automations

# Build Next.js app
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

# Install Python and required packages for audience generation scripts
RUN apk add --no-cache python3 py3-pip postgresql-dev gcc python3-dev musl-dev && \
    pip3 install --no-cache-dir --break-system-packages psycopg2-binary python-dotenv && \
    apk del gcc python3-dev musl-dev

WORKDIR /app

ENV NODE_ENV=production

# Copy built application
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

# Copy automations data (scheduled jobs) - use wildcard to handle empty dir
COPY --from=builder /app/.automations/ ./.automations/

# Copy audience generation scripts (Python)
COPY --from=builder /app/audience-generation-scripts ./audience-generation-scripts

# Create expected Python module structure for imports
# Scripts import from: basic_capabilities.internal_db_queries_toolbox
COPY --from=builder /app/shared/python-utilities ./basic_capabilities/internal_db_queries_toolbox

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:railway"]
