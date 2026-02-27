# Redis Setup for Distributed Rate Limiting

## Why Redis?

When running multiple server instances (PM2 cluster mode, load balancers, or multiple VMs), in-memory rate limiting doesn't work correctly because each instance has its own memory. Redis provides a shared data store that all instances can access.

**Current Status:**
- ✅ Without Redis: Works fine for single instance
- ⚠️ Without Redis in cluster mode: Each instance tracks limits independently (weaker protection)
- ✅ With Redis: Rate limits are shared across all instances (stronger protection)

## Installation

### Ubuntu/Debian (Google Cloud VM)

```bash
# Install Redis
sudo apt update
sudo apt install redis-server -y

# Start Redis service
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verify Redis is running
redis-cli ping
# Should respond with: PONG
```

### Local Development (Windows)

```bash
# Using Chocolatey
choco install redis-64

# Or download from: https://github.com/microsoftarchive/redis/releases

# Start Redis
redis-server
```

### Docker (Recommended for Development)

```bash
# Run Redis in Docker
docker run -d \
  --name redis-rate-limit \
  -p 6379:6379 \
  redis:7-alpine

# Verify
docker ps
```

## Configuration

### 1. Add Redis URL to .env

```env
# Redis URL for rate limiting (optional)
# If not set, will fall back to in-memory rate limiting
REDIS_URL=redis://localhost:6379

# For password-protected Redis:
# REDIS_URL=redis://username:password@hostname:6379

# For Redis on different host:
# REDIS_URL=redis://10.0.0.5:6379
```

### 2. Install Redis Package

```bash
npm install
```

### 3. Restart the Server

```bash
# For PM2
pm2 restart acc-user-management

# For development
npm start
```

## Verification

Check server logs on startup:

**With Redis:**
```
✅ Redis connected - rate limiting shared across all instances
```

**Without Redis (fallback):**
```
ℹ️ Redis not available, using in-memory rate limiting (single instance only)
   To enable Redis: Install Redis and set REDIS_URL in .env
```

## Production Deployment

### Google Cloud VM

```bash
# SSH into VM
gcloud compute ssh acc-user-management-v2-vm --zone=europe-west6-b

# Install Redis
sudo apt update
sudo apt install redis-server -y

# Configure Redis for production
sudo nano /etc/redis/redis.conf

# Recommended settings:
# maxmemory 256mb
# maxmemory-policy allkeys-lru
# bind 127.0.0.1 ::1  # Only allow local connections

# Restart Redis
sudo systemctl restart redis-server

# Add to .env
cd /home/samsona/ACC_User_Management_Cloud
echo "REDIS_URL=redis://localhost:6379" >> .env

# Restart app
pm2 restart acc-user-management

# Monitor
pm2 logs
```

### Redis Security

For production, consider:

1. **Password protection:**
   ```bash
   # In /etc/redis/redis.conf
   requirepass YOUR_STRONG_PASSWORD
   
   # Update .env
   REDIS_URL=redis://:YOUR_STRONG_PASSWORD@localhost:6379
   ```

2. **Firewall:** Ensure Redis port (6379) is not exposed externally
   ```bash
   sudo ufw deny 6379
   ```

3. **Monitoring:** Check Redis memory usage
   ```bash
   redis-cli info memory
   ```

## Benefits of Using Redis

✅ **Shared rate limiting** across all server instances  
✅ **Accurate limits** in cluster/multi-server deployments  
✅ **Automatic expiration** of rate limit keys  
✅ **Production-ready** and battle-tested  
✅ **Memory efficient** with LRU eviction policies  
✅ **No code changes** if Redis unavailable (graceful fallback)

## Troubleshooting

### Redis Connection Fails

Check Redis is running:
```bash
sudo systemctl status redis-server
redis-cli ping
```

### Port Already in Use

Check what's using port 6379:
```bash
sudo lsof -i :6379
```

### Permission Denied

Ensure Redis is configured to accept connections:
```bash
sudo nano /etc/redis/redis.conf
# Check: bind 127.0.0.1 ::1
# Check: protected-mode yes
```

## Performance Impact

- Redis adds ~1-2ms latency per request
- Negligible CPU impact
- Memory usage: ~50-100MB for rate limiting data
- Worth the trade-off for multi-instance deployments

## When NOT to Use Redis

- Single server instance with no plans to scale
- Development/testing environments
- Extremely tight latency requirements (<5ms)

In these cases, the in-memory fallback works perfectly fine.
