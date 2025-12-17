# Push Notification System - GCP Deployment Guide

Unified Docker image containing **push-blaster** (UI, automation engine) and **push-cadence-service** (frequency caps, notification tracking).

## Image Location

```
us-east1-docker.pkg.dev/tradeblock-infrastructure/push-notification-system/push-notification-system:latest
```

## Quick Start

```bash
# Build and push using Cloud Build (recommended)
gcloud builds submit --config cloudbuild.yaml .

# Verify the image
gcloud artifacts docker images list us-east1-docker.pkg.dev/tradeblock-infrastructure/push-notification-system
```

## Manual Build (if needed)

```bash
# Configure Docker for GAR
gcloud auth configure-docker us-east1-docker.pkg.dev

# Build locally
docker build -f Dockerfile.unified -t us-east1-docker.pkg.dev/tradeblock-infrastructure/push-notification-system/push-notification-system:latest .

# Push
docker push us-east1-docker.pkg.dev/tradeblock-infrastructure/push-notification-system/push-notification-system:latest
```

## Ports

| Port | Service | Purpose |
|------|---------|---------|
| 3001 | push-blaster | Main UI, push API, automation engine |
| 3002 | push-cadence-service | Internal cadence filtering API |

**Note:** Only port 3001 needs external exposure. Port 3002 is for internal service-to-service communication.

## Required Environment Variables

These should be configured in Google Secret Manager following Tradeblock patterns:

```bash
# Database - Main Tradeblock PostgreSQL
DATABASE_URL=postgresql://user:pass@internal-host:5432/database

# Database - Cadence/History (Neon PostgreSQL)
PUSH_CADENCE_DATABASE_URL=postgresql://user:pass@neon-host/database

# Firebase (for push delivery)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# GraphQL endpoint for device tokens
GRAPHQL_ENDPOINT=https://your-api.com/graphql

# Internal service communication (DO NOT CHANGE)
CADENCE_SERVICE_URL=http://localhost:3002
```

## Health Checks

```bash
# push-blaster health
curl http://[SERVICE_URL]/api/health

# push-cadence-service health (internal only)
curl http://[SERVICE_URL]:3002/api/health
```

Both should return JSON with `"status": "healthy"` or `"status": "degraded"`.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 CONTAINER (supervisord)                  │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────────┐  │
│  │   push-blaster      │  │  push-cadence-service   │  │
│  │   (port 3001)       │──│  (port 3002)            │  │
│  │                     │  │                         │  │
│  │  • Web UI           │  │  • Cadence rules        │  │
│  │  • Push API         │  │  • Frequency filtering  │  │
│  │  • Automation       │  │  • Notification history │  │
│  └─────────────────────┘  └─────────────────────────┘  │
│           │                          │                  │
├───────────┼──────────────────────────┼──────────────────┤
│           ▼                          ▼                  │
│   ┌──────────────────┐    ┌──────────────────────┐     │
│   │  Tradeblock DB   │    │  Neon PostgreSQL     │     │
│   │  (internal)      │    │  (Cadence/History)   │     │
│   └──────────────────┘    └──────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

## GKE Deployment (Tradeblock Pattern)

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: push-notification-api-deployment
  labels:
    environment: production
    app: push-notification
    type: api
  namespace: production
spec:
  replicas: 1
  selector:
    matchLabels:
      app: push-notification
      type: api
  template:
    metadata:
      labels:
        environment: production
        app: push-notification
        type: api
    spec:
      serviceAccountName: push-notification-service-account
      containers:
        - name: push-notification-api-container
          image: us-east1-docker.pkg.dev/tradeblock-infrastructure/push-notification-system/push-notification-system:latest
          ports:
            - containerPort: 3001
            - containerPort: 3002
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          # Secrets mounted from Google Secret Manager
          volumeMounts:
            - name: push-notification-secrets
              mountPath: /etc/secrets/env.json
              readOnly: true
              subPath: env.json
          startupProbe:
            httpGet:
              path: /api/health
              port: 3001
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 30
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3001
            initialDelaySeconds: 60
            periodSeconds: 30
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3001
            initialDelaySeconds: 10
            periodSeconds: 10
            successThreshold: 1
            failureThreshold: 3
      volumes:
        - name: push-notification-secrets
          csi:
            driver: secrets-store-gke.csi.k8s.io
            readOnly: true
            volumeAttributes:
              secretProviderClass: push-notification-secrets
```

### Kubernetes Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: push-notification-api-service
  labels:
    environment: production
    app: push-notification
    type: api
  namespace: production
  annotations:
    cloud.google.com/neg: '{"ingress": true}'
spec:
  selector:
    app: push-notification
    type: api
  ports:
    - port: 80
      targetPort: 3001
```

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: push-notification-api-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: push-notification-api-deployment
  minReplicas: 1
  maxReplicas: 3
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 80
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

## Secrets Setup (Google Secret Manager)

```bash
# Create secret in Secret Manager
gcloud secrets create push-notification-secrets --replication-policy="automatic"

# Add secret version with JSON config
echo '{
  "DATABASE_URL": "postgresql://...",
  "PUSH_CADENCE_DATABASE_URL": "postgresql://...",
  "FIREBASE_PROJECT_ID": "...",
  "FIREBASE_CLIENT_EMAIL": "...",
  "FIREBASE_PRIVATE_KEY": "...",
  "GRAPHQL_ENDPOINT": "...",
  "CADENCE_SERVICE_URL": "http://localhost:3002"
}' | gcloud secrets versions add push-notification-secrets --data-file=-
```

## Troubleshooting

### Container won't start
- Check logs: `kubectl logs deployment/push-notification-api-deployment -n production`
- Verify secrets are mounted: `kubectl exec -it [pod] -n production -- cat /etc/secrets/env.json`
- Ensure DATABASE_URL is reachable from GKE cluster

### Database connection errors
- `ENOTFOUND`: DNS resolution failed - check internal hostname
- `ECONNREFUSED`: DB not accepting connections - check VPC peering
- `timeout`: Network path blocked - check firewall rules

### Cadence service not filtering
- Verify `CADENCE_SERVICE_URL=http://localhost:3002` (NOT external URL)
- Check `/api/health` on port 3002

## Files

| File | Purpose |
|------|---------|
| `Dockerfile.unified` | Multi-stage build for unified image |
| `cloudbuild.yaml` | Cloud Build configuration for GAR |
| `supervisord.conf` | Process manager config for both services |
| `DEPLOYMENT.md` | This file |
