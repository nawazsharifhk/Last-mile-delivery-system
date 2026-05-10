# Deployment Guide - Option 1: Vercel Frontend + Local API

## Overview
- **Frontend**: Deployed on Vercel (static hosting)
- **Backend API**: Running locally on your machine or a personal server
- **Database**: Local SQLite

---

## Frontend Deployment (Vercel)

### Prerequisites
- Vercel account (sign up at https://vercel.com)
- GitHub account with your repository pushed

### Step 1: Deploy to Vercel

1. Go to https://vercel.com/dashboard
2. Click **"New Project"**
3. Click **"Import Git Repository"**
4. Select: `nawazsharifhk/Last-mile-delivery-system`
5. Configure:
   - **Project Name**: `last-mile-delivery-system` (or your choice)
   - **Framework Preset**: Select **"Other"** (static files)
   - **Root Directory**: `./` (default)
   - **Build Command**: Leave empty (no build needed)
   - **Output Directory**: `frontend`
6. Click **"Deploy"**

### Step 2: Vercel will generate a URL like:
```
https://last-mile-delivery-system.vercel.app
```

---

## Backend API Setup (Local)

The backend API runs on your local machine or a personal server.

### Prerequisites
- Python 3.12+
- Virtual environment set up (already done in `.venv`)

### Step 1: Start the API Locally

```bash
cd "c:\Users\nawaz\OneDrive\Desktop\minor pro\Last-Mile (anti gravity)\Last-Mile"
python scripts/run_api.py
```

The API will start on:
```
http://127.0.0.1:8000
```

### Step 2: Keep it Running
- The terminal running the API must stay open
- If needed, use a process manager like `pm2` (for production-like local hosting)

---

## Connecting Frontend to Backend

### Option A: Local Development (API on localhost:8000)
No changes needed! The frontend already makes requests to the local API.

**Frontend URLs:**
- Dashboard: `http://localhost:8000/app`
- API Docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

### Option B: Deployed Frontend + Local API (Requires Port Forwarding)

If you want the **Vercel frontend** to communicate with your **local API**:

1. **Use ngrok for tunneling** (recommended for testing):
   ```bash
   # Install ngrok: https://ngrok.com/download
   ngrok http 8000
   ```
   
   This gives you a public URL like: `https://xxxx-xx-xxx-xx-x.ngrok.io`

2. **Update frontend to use ngrok URL**:
   
   Edit `frontend/app.js` and find the `fetchJson` function:
   
   ```javascript
   async function fetchJson(url, payload, timeoutMs) {
       // Replace this line:
       const fullUrl = url;  // Uses relative URL
       
       // With:
       const fullUrl = 'https://xxxx-xx-xxx-xx-x.ngrok.io' + url;
   ```

3. **Redeploy frontend** to Vercel after making changes

---

## API Endpoints

After starting the API, access these endpoints:

| Endpoint | URL | Purpose |
|----------|-----|---------|
| Health Check | `/health` | Verify API is running |
| API Docs | `/docs` | Interactive API documentation (Swagger) |
| Dashboard | `/app` | Web UI dashboard |
| Process Orders | `POST /orders/process` | Process delivery orders |
| Predict Failure | `POST /predict/failure` | Predict delivery failures |
| Optimize Route | `POST /route/optimize` | Optimize delivery routes |
| Counterfactual | `POST /counterfactual/simulate` | Run what-if analysis |

---

## Testing

### Test API is Running Locally
```bash
# Health check
curl http://127.0.0.1:8000/health

# View API docs
# Open in browser: http://127.0.0.1:8000/docs
```

### Test Vercel Frontend
```
https://last-mile-delivery-system.vercel.app
```

---

## Troubleshooting

### Issue: Frontend can't reach API
**Solution**: 
- Ensure API is running: `python scripts/run_api.py`
- Check API is on localhost:8000
- Check browser console (F12) for CORS errors

### Issue: API crashes when running
**Solution**:
- Check Python dependencies: `pip install -r requirements.txt`
- Check model files exist: `models/failure_model.pkl`, `models/preprocessor.pkl`
- Check port 8000 is not in use: `netstat -ano | findstr :8000`

### Issue: Data files not found
**Solution**:
- Seed data: `python scripts/seed_data.py`
- Train model: `python scripts/train_model.py`

### Issue: CORS errors with ngrok
**Solution**:
- Add ngrok URL to allowed origins in `src/settings.py`:
  ```python
  ALLOWED_ORIGINS = [
      "https://xxxx-xx-xxx-xx-x.ngrok.io",
      "https://last-mile-delivery-system.vercel.app"
  ]
  ```

---

## Updating Deployment

### Update Frontend
1. Make changes to `frontend/` files
2. `git add frontend/`
3. `git commit -m "Update frontend"`
4. `git push origin main`
5. Vercel auto-redeploys (check vercel.com/dashboard)

### Update Backend
1. Make changes to `src/` or other files
2. Restart local API: `python scripts/run_api.py`
3. (No git push needed for local API)

---

## Advanced: Keep API Running 24/7 (Optional)

If you want the API to run permanently on your local machine:

### Option 1: Windows Task Scheduler
1. Create a `.bat` file:
   ```batch
   cd "c:\Users\nawaz\OneDrive\Desktop\minor pro\Last-Mile (anti gravity)\Last-Mile"
   python scripts/run_api.py
   ```
2. Schedule it in Task Scheduler to run on startup

### Option 2: PM2 (Node.js based process manager)
```bash
# Install PM2
npm install -g pm2

# Create PM2 config file
pm2 start scripts/run_api.py --name last-mile-api --interpreter python

# Save and auto-start on reboot
pm2 save
pm2 startup
```

### Option 3: Deploy Backend Separately
For a more robust setup, deploy the backend to Railway, Render, or PythonAnywhere.
Then update the frontend URL to point to the cloud API.

---

## Summary

| Component | Location | How to Access |
|-----------|----------|---------------|
| Frontend | Vercel | `https://last-mile-delivery-system.vercel.app` |
| Backend API | Your machine | `http://127.0.0.1:8000` |
| Dashboard | Local | `http://127.0.0.1:8000/app` |
| API Docs | Local | `http://127.0.0.1:8000/docs` |

**To use**: Start API locally, then access Vercel frontend URL in browser.


