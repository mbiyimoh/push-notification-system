# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy the push-blaster service
COPY services/push-blaster/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY services/push-blaster/ ./

# Build Next.js app
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built application
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:railway"]
