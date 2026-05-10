# Deployment Guide

## Frontend Deployment (Vercel)

### Step 1: Prepare Frontend
The frontend files are in the `frontend/` directory.

### Step 2: Deploy to Vercel
1. Go to https://vercel.com and sign up/login
2. Click "New Project"
3. Import your GitHub repository: `https://github.com/nawazsharifhk/Last-mile-delivery-system`
4. Configure:
   - Framework Preset: **Other**
   - Build Command: (leave empty - static files)
   - Output Directory: `frontend`
   - Environment Variables:
     - `REACT_APP_API_URL`: `https://your-railway-api.up.railway.app` (set after backend deployment)

5. Click Deploy

### Step 3: Update API URL in Frontend
After the backend is deployed, update `frontend/app.js` to point to your Railway API URL:

```javascript
const API_BASE_URL = 'https://your-railway-api.up.railway.app';
```

---

## Backend Deployment (Railway.app)

### Step 1: Setup Railway Account
1. Go to https://railway.app and sign up with GitHub
2. Create a new project

### Step 2: Deploy from GitHub
1. In Railway, click "New Project" → "Deploy from GitHub"
2. Select your repository: `Last-mile-delivery-system`
3. Select the `main` branch
4. Wait for auto-detection of Python environment

### Step 3: Configure Environment Variables
In Railway dashboard, go to "Variables" and add:

```
APP_NAME=Smart Last-Mile Delivery System
ENV=production
HOST=0.0.0.0
PORT=$PORT
MODEL_PATH=models/failure_model.pkl
PREPROCESSOR_PATH=models/preprocessor.pkl
METADATA_PATH=models/metadata.json
ENABLE_WEATHER=true
ENABLE_PLACE_GRAPH=true
ENABLE_COUNTERFACTUAL=true
```

### Step 4: Configure Start Command
In Railway settings:
- **Start Command**: `python scripts/run_api.py`

Or Railway may auto-detect from `Procfile` (already created)

### Step 5: Generate Domain
Railway will auto-generate a public URL like:
```
https://last-mile-delivery-system-production-xxxx.up.railway.app
```

---

## Important Notes

### Model Files
The trained ML model files are included in the repo:
- `models/failure_model.pkl` (XGBoost model)
- `models/preprocessor.pkl` (sklearn preprocessing)
- `models/metadata.json` (model metadata)

### Database
The system uses SQLite (app.db) which will be created on first run.

### Data Files
Required data files are included:
- `data/processed/orders_clean.csv`
- `data/processed/features_train.csv`
- `data/processed/geocode_cache.json`
- `data/processed/place_graph.json`

### API Endpoints (After Deployment)
- Health: `https://your-api.up.railway.app/health`
- Docs: `https://your-api.up.railway.app/docs`
- Dashboard: `https://your-api.up.railway.app/app`
- Orders: `https://your-api.up.railway.app/orders/process`
- Predict: `https://your-api.up.railway.app/predict/failure`
- Route Optimize: `https://your-api.up.railway.app/route/optimize`

---

## Troubleshooting

### Issue: Python version mismatch
**Solution**: Railway should auto-detect Python 3.12 from your repo. If not, create a `runtime.txt`:
```
python-3.12.10
```

### Issue: Port issues
Railway sets the `PORT` environment variable. The app auto-handles this in `scripts/run_api.py`.

### Issue: Model files not found
Ensure git includes `models/` directory:
```bash
git add models/
git commit -m "Add trained models"
git push
```

### Issue: Large file uploads fail
If models are > 100MB, use Git LFS:
```bash
git lfs install
git lfs track "models/*.pkl"
git add .gitattributes models/
git commit -m "Use Git LFS for model files"
git push
```

---

## Testing Deployment

After deployment, test the API:

```bash
# Health check
curl https://your-api.up.railway.app/health

# Get API docs
curl https://your-api.up.railway.app/docs

# Test prediction
curl -X POST https://your-api.up.railway.app/predict/failure \
  -H "Content-Type: application/json" \
  -d '{"pincode": "123456", "address": "123 Main St"}'
```

---

## Frontend + Backend Communication

The frontend (`app.js`) needs to know the backend URL. Update:

**frontend/app.js:**
```javascript
// Change this line:
const API_BASE_URL = 'http://localhost:8000';

// To:
const API_BASE_URL = 'https://your-api.up.railway.app';
```

Then redeploy to Vercel after updating.

---

## Rollback

To rollback to a previous version:
- **Railway**: Use "Deployments" tab and click "Redeploy"
- **Vercel**: Use "Deployments" and click the previous version

---

## Cost Estimates (May 2026)

- **Railway**: Free tier available, $5-20/month for production
- **Vercel**: Free tier for static sites, $20/month for pro features

