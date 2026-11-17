# WareSync AI: Docker & Cloud Deployment Execution Plan

> **Objective:** Deliver a zero-dependency, containerized deployment strategy for WareSync AI that guarantees compliance with the final evaluation criteria ("The project MUST be fully deployed prior to the assessment. Nothing should be dependent on or executed from the local machine during the demonstration").

---

## 1. Container Architecture & Components

```
┌────────────────────────────────────────────────────────────────────────┐
│                   DOCKER CONTAINER (waresync-ai-system)               │
│                                                                        │
│   ┌──────────────────────────────────────────────────────────────┐    │
│   │                 FASTAPI ASGI WEB GATEWAY (Uvicorn)           │    │
│   │   - Port: 8000 (Mapped to 8000 on Host)                      │    │
│   │   - Static Web Portals (Operations Cockpit, Storefront)      │    │
│   │   - WebSocket Channel (/ws/stream)                           │    │
│   └──────────────────────────────┬───────────────────────────────┘    │
│                                  │                                     │
│   ┌──────────────────────────────┴───────────────────────────────┐    │
│   │               MULTI-AGENT SYSTEM (MAS) ENGINES               │    │
│   │   - CrewAI Agents: Supervisor, Procurement, Dispatch         │    │
│   │   - Google ADK Agents: Inventory Custodian, Invoice Auditor  │    │
│   │   - Central Hover Blackboard State (Thread-Safe RLock)       │    │
│   │   - FastMCP Tool Server (db_check, 3-way match, quote calc)  │    │
│   │   - Security Guardrails (Injection interceptors)             │    │
│   └──────────────────────────────┬───────────────────────────────┘    │
│                                  │                                     │
│   ┌──────────────────────────────┴───────────────────────────────┐    │
│   │               PERSISTENT VOLUMES & REPORTLAB PDFS            │    │
│   │   - /app/data/invoices/ (Delivery Challans & Invoices)       │    │
│   │   - /app/data/policies/ (Warehouse SOPs & Policies)          │    │
│   └──────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Docker Files & Enhancements

### 2.1 Optimized `Dockerfile`
Features:
- Base: `python:3.11-slim` (standardized, predictable Python environment with Pydantic v2).
- Native system dependencies: `curl`, `build-essential`.
- Built-in container health check hitting `/api/health`.
- Explicit `PYTHONPATH=/app`.

### 2.2 Production-Grade `docker-compose.yml`
Features:
- `restart: unless-stopped` ensuring the container stays online if the VPS restarts.
- Health check polling every 30 seconds.
- Persistent volume mounting for `/app/data` to preserve generated Delivery Challan PDFs and Invoices across container restarts.
- Port mapping `8000:8000`.

---

## 3. Step-by-Step Execution Guide

### Option A: Running on Local Machine with Docker (Local Testing)

```bash
# 1. Build and launch container in detached mode
docker-compose up --build -d

# 2. Check running container status and health
docker-compose ps

# 3. View live application logs
docker-compose logs -f

# 4. Access the web dashboards in your browser:
#    - Operations Cockpit: http://localhost:8000
#    - Customer Storefront: http://localhost:8000/customer.html
#    - Microservices Hub: http://localhost:8000/microservices.html

# 5. Stop the container when needed
docker-compose down
```

---

### Option B: Deploying to Cloud VPS (Mandatory Evaluation Demonstration)

You can deploy this to any \$5/mo Linux VPS (AWS EC2, DigitalOcean Droplet, Linode, or Hetzner).

#### Step 1: Provision and Connect to VPS
```bash
# Connect to your cloud VPS via SSH
ssh root@<YOUR_VPS_IP>
```

#### Step 2: Install Docker & Docker Compose on VPS
```bash
# Update Ubuntu package lists and install Docker
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y docker.io docker-compose git curl

# Verify installation
docker --version
docker-compose --version
```

#### Step 3: Clone Repository and Launch
```bash
# Clone the repository
git clone https://github.com/yuvrajarora1805/agenticai.git
cd agenticai

# Build and start container in the background
sudo docker-compose up --build -d

# Check that the container is healthy
sudo docker-compose ps
```

#### Step 4: Open Firewall Port (If applicable)
```bash
# If using UFW firewall on Ubuntu:
sudo ufw allow 8000/tcp
sudo ufw reload

# If on AWS EC2: Ensure Security Group has inbound rule for Custom TCP Port 8000 (Source: 0.0.0.0/0).
```

#### Step 5: Test Live Cloud URL
Open your browser and navigate to:
- `http://<YOUR_VPS_IP>:8000`
- `http://<YOUR_VPS_IP>:8000/customer.html`

---

## 4. Evaluation Demonstration Verification Checklist

| Check | Command / Action | Expected Result |
| :--- | :--- | :--- |
| **Container Running** | `docker ps` | Status: `Up (healthy)`, Port: `0.0.0.0:8000->8000/tcp` |
| **Health API** | `curl http://localhost:8000/api/health` | `{"status":"HEALTHY","system":"WareSync AI",...}` |
| **42 Benchmarks Run** | `curl -X POST http://localhost:8000/api/run-batch-benchmark` | All 42 scenarios executed with JSON results |
| **PDF Generation** | Place order on `/customer.html` | Delivery Challan PDF written to `/app/data/invoices/challans/` |
| **No Local Dep.** | Close terminal / laptop disconnect test | Cloud app continues responding smoothly |

