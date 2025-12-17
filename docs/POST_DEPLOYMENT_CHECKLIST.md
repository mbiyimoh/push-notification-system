# Post-Deployment Checklist

Use this checklist after lead dev deploys the container and provides the public URL.

## Prerequisites
- [ ] Lead dev has deployed the container
- [ ] You have the public URL: `https://___________________`
- [ ] Environment variables are configured in GCP

---

## Step 1: Health Checks

```bash
# Check push-blaster health
curl https://[YOUR-URL]/api/health

# Expected: JSON with "status": "healthy" or "degraded"
# Check: "dependencies.database" should be "connected"
```

**If database shows "degraded":** Environment variables may not be set correctly. Contact lead dev.

---

## Step 2: Verify Automations Exist

```bash
curl https://[YOUR-URL]/api/automation/recipes
```

**Expected:** JSON array of automation configurations (Daily Layer 3, etc.)

**If empty:** Automations may need to be recreated or restored from backup.

---

## Step 3: Test Push (Layer 4 = Test Layer)

```bash
curl -X POST https://[YOUR-URL]/api/send-push \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Push",
    "body": "Testing from new GCP deployment",
    "layerId": 4,
    "userIds": "[YOUR-TEST-USER-ID]"
  }'
```

**Expected:** JSON with success counts

**To find your test user ID:** Check the Tradeblock database or ask lead dev.

---

## Step 4: Check Automation Engine Status

```bash
curl https://[YOUR-URL]/api/automation/monitor
```

**Expected:** Shows scheduled jobs count > 0

---

## Step 5: Manual Automation Run

1. Open `https://[YOUR-URL]` in browser
2. Navigate to an automation (e.g., Daily Layer 3)
3. Click "Run Now" button
4. Watch execution logs for success/failure

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `"database": "degraded"` | DATABASE_URL not set or wrong | Check env vars in GCP |
| `ENOTFOUND` errors | DNS/hostname issue | Verify internal hostname |
| `CADENCE_SERVICE_URL` errors | Wrong URL configured | Must be `http://localhost:3002` |
| No automations found | Storage not persisted | May need to recreate automations |
| Firebase errors | FIREBASE_* env vars missing | Check Firebase credentials |

---

## Success Criteria

- [ ] Health check returns `"status": "healthy"`
- [ ] Database shows `"connected"`
- [ ] Test push (Layer 4) sends successfully
- [ ] Automations are visible in UI
- [ ] Manual "Run Now" executes without errors
