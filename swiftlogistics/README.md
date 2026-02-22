# SwiftTrack Logistics - Microservices Backend

A scalable middleware architecture for the SwiftTrack logistics management system using Docker, RabbitMQ, PostgreSQL, and the Saga pattern for distributed transactions.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SWIFTTRACK ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐                                                          │
│  │   Frontend   │  React + Vite                                            │
│  │   (Port 5173)│  Unchanged - All API calls preserved                     │
│  └──────┬───────┘                                                          │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────┐                                                          │
│  │ API Gateway  │  Flask - JWT Auth, Request Routing                       │
│  │  (Port 5002) │  Single entry point for all requests                     │
│  └──────┬───────┘                                                          │
│         │                                                                   │
│  ┌──────┴──────────────────────────────────────────┐                       │
│  │                 MIDDLEWARE SERVICE               │                       │
│  │             Business Logic Orchestration         │                       │
│  │          Saga Initiation & Event Publishing      │                       │
│  └──────┬──────────────────────────────────────────┘                       │
│         │                                                                   │
│  ┌──────┴──────────────────────────────────────────────────────────┐       │
│  │                    HETEROGENEOUS SYSTEMS                         │       │
│  │                                                                  │       │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐     │       │
│  │  │   CMS Service  │  │   ROS Service  │  │   WMS Service  │     │       │
│  │  │   (SOAP/XML)   │  │  (REST/JSON)   │  │  (Messaging)   │     │       │
│  │  │   Port 5003    │  │   Port 5004    │  │   Port 5005    │     │       │
│  │  │                │  │                │  │                │     │       │
│  │  │  Customer Mgmt │  │ Route Optim.   │  │ Warehouse Mgmt │     │       │
│  │  │  Validation    │  │ Distance Calc  │  │ Inventory      │     │       │
│  │  └────────────────┘  └────────────────┘  └────────────────┘     │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                       MESSAGE BROKER (RabbitMQ)                  │       │
│  │                                                                  │       │
│  │   Exchanges:                      Queues:                        │       │
│  │   • swifttrack.orders (topic)     • order.created                │       │
│  │   • swifttrack.warehouse (direct) • warehouse.receive            │       │
│  │   • swifttrack.notifications      • warehouse.dispatch           │       │
│  │     (fanout)                      • notification.email           │       │
│  │   • swifttrack.saga (topic)       • saga.execute                 │       │
│  │   • swifttrack.dlx (dead letter)  • *.dlq (Dead Letter Queues)   │       │
│  │                                                                  │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                         SAGA ORCHESTRATOR                        │       │
│  │                                                                  │       │
│  │   • Coordinates distributed transactions                         │       │
│  │   • Executes steps in sequence                                   │       │
│  │   • Runs compensation on failure (rollback)                      │       │
│  │   • Maintains saga state in PostgreSQL                           │       │
│  │                                                                  │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                      DATABASE (PostgreSQL)                       │       │
│  │                                                                  │       │
│  │   Tables: users, clients, drivers, orders, order_timeline,       │       │
│  │           warehouse_inventory, routes, route_stops, saga_state,  │       │
│  │           system_logs, notifications, billing_history,           │       │
│  │           message_outbox                                         │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Features

### 1. **No Message Loss (Durable Queues + Acknowledgement)**
- All queues declared as `durable: true`
- Messages persisted with `delivery_mode: 2`
- Manual acknowledgement (`basic_ack`) - messages only removed after successful processing
- Dead Letter Queues (DLQ) for failed messages after max retries

### 2. **Transaction Consistency (Saga Pattern)**
- Distributed transactions coordinated by Saga Orchestrator
- Step-by-step execution with state tracking
- Automatic compensation (rollback) on any step failure
- Saga state persisted in PostgreSQL for recovery

### 3. **Heterogeneous System Integration**
| System | Protocol | Purpose |
|--------|----------|---------|
| CMS (Customer Management) | SOAP/XML | Customer validation, profile management |
| ROS (Route Optimization) | REST/JSON | Route calculation, ETA estimation |
| WMS (Warehouse Management) | RabbitMQ Messaging | Inventory management, package tracking |

### 4. **JWT Authentication**
- Token-based authentication via API Gateway
- 24-hour token expiration
- Protected routes with `@token_required` decorator
- Role-based access control (admin, client, driver)

## Quick Start

### Prerequisites
- Docker Desktop installed and running
- At least 4GB RAM available for Docker

### Run the Backend

```bash
# Navigate to backend directory
cd swiftlogistics

# Build and start all services
docker-compose up --build

# Wait for all services to be healthy (about 30-60 seconds)
# You should see "healthy" status for all containers

# To run in background (detached mode)
docker-compose up --build -d

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f api-gateway
docker-compose logs -f middleware-service
```

### Stop the Backend

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (clears database)
docker-compose down -v
```

### Run the Frontend

```bash
# Navigate to frontend directory
cd ../swifttrack-frontend

# Install dependencies (first time only)
npm install

# Start development server
npm run dev
```

Frontend will be available at: `http://localhost:5173`
Backend API Gateway at: `http://localhost:5002`

## Service Ports

| Service | Port | Description |
|---------|------|-------------|
| API Gateway | 5002 | Main entry point (only exposed port) |
| Middleware | 5001 | Business logic (internal) |
| CMS Service | 5003 | SOAP/XML (internal) |
| ROS Service | 5004 | REST/JSON (internal) |
| WMS Service | 5005 | Messaging consumer (internal) |
| Notification | 5006 | Notification consumer (internal) |
| Saga Orchestrator | 5007 | Saga consumer (internal) |
| PostgreSQL | 5432 | Database (internal) |
| RabbitMQ | 5672, 15672 | Message broker / Management UI |

## Management Interfaces

### RabbitMQ Management
- URL: `http://localhost:15672`
- Username: `swifttrack`
- Password: `swifttrack_mq_2026`

### PostgreSQL
```bash
# Connect via Docker
docker exec -it swifttrack-postgres psql -U swifttrack_user -d swifttrack

# Or use any PostgreSQL client
# Host: localhost
# Port: 5432
# Database: swifttrack
# User: swifttrack_user
# Password: swifttrack_secure_pass_2026
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login, returns JWT |
| POST | `/api/auth/register` | User registration |
| GET | `/api/auth/me` | Get current user info |
| POST | `/api/auth/logout` | User logout |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | List orders (filtered by role) |
| GET | `/api/orders/:id` | Get order details |
| POST | `/api/orders` | Create new order |
| PUT | `/api/orders/:id` | Update order |
| PUT | `/api/orders/:id/status` | Update order status |
| PUT | `/api/orders/:id/assign` | Assign driver to order |

### Drivers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/drivers` | List all drivers |
| GET | `/api/drivers/:id` | Get driver details |
| GET | `/api/drivers/:id/orders` | Get driver's orders |
| GET | `/api/drivers/available` | List available drivers |

### Clients
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/clients` | List all clients |
| GET | `/api/clients/:id` | Get client details |
| GET | `/api/clients/:id/orders` | Get client's orders |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users |
| GET | `/api/admin/analytics` | Get system analytics |
| GET | `/api/admin/logs` | Get system logs |

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@swifttrack.com | admin123 |
| Client | john.doe@example.com | password123 |
| Client | jane.smith@example.com | password123 |
| Driver | mike.driver@swifttrack.com | password123 |
| Driver | sarah.driver@swifttrack.com | password123 |

## Project Structure

```
swiftlogistics/
├── docker-compose.yml          # Docker orchestration
├── README.md                   # This file
│
├── database/
│   └── init.sql               # PostgreSQL schema & seed data
│
├── rabbitmq/
│   ├── rabbitmq.conf          # RabbitMQ configuration
│   └── definitions.json       # Exchanges, queues, bindings
│
├── api-gateway/
│   ├── app.py                 # JWT auth, request routing
│   ├── Dockerfile
│   └── requirements.txt
│
├── middleware-service/
│   ├── app.py                 # Business logic, Saga initiation
│   ├── Dockerfile
│   └── requirements.txt
│
├── cms-service/
│   ├── soap_service.py        # SOAP/XML customer management
│   ├── Dockerfile
│   └── requirements.txt
│
├── ros-service/
│   ├── rest_service.py        # REST/JSON route optimization
│   ├── Dockerfile
│   └── requirements.txt
│
├── wms-service/
│   ├── consumer.py            # RabbitMQ warehouse consumer
│   ├── Dockerfile
│   └── requirements.txt
│
├── notification-service/
│   ├── notifier.py            # Notification consumer
│   ├── Dockerfile
│   └── requirements.txt
│
└── saga-orchestrator/
    ├── orchestrator.py        # Saga pattern implementation
    ├── Dockerfile
    └── requirements.txt
```

## Saga Pattern Implementation

### Order Creation Saga

```
Step 1: Validate Customer (CMS - SOAP)
    ↓ Success
Step 2: Reserve Warehouse Slot (WMS - Messaging)
    ↓ Success
Step 3: Calculate Route (ROS - REST)
    ↓ Success
Step 4: Confirm Order (Middleware)
    ↓ Success
✓ SAGA COMPLETED

If any step fails:
    ← Compensation runs in REVERSE order
    ← Release warehouse slot
    ← Cancel route
    ← Revert order status
✗ SAGA COMPENSATED
```

### Implemented Sagas

1. **create_order** - Create and confirm new order
2. **assign_driver** - Assign driver to order with route
3. **complete_delivery** - Complete delivery and update systems

## Message Flow Example

```
1. Frontend calls POST /api/orders
   │
2. API Gateway validates JWT, forwards to Middleware
   │
3. Middleware creates order, initiates Saga
   │
   ├─→ Publishes to swifttrack.saga exchange
   │   └─→ Saga Orchestrator executes steps
   │       ├─→ CMS: Validate customer (SOAP)
   │       ├─→ WMS: Reserve slot (RabbitMQ)
   │       └─→ ROS: Calculate route (REST)
   │
   └─→ Publishes to swifttrack.orders exchange
       └─→ Order consumers process event
           └─→ Notification service sends alerts
```

## Monitoring & Debugging

### Check Service Health
```bash
# All services
docker-compose ps

# Individual service logs
docker-compose logs wms-service
docker-compose logs saga-orchestrator
```

### RabbitMQ Queues
Access `http://localhost:15672` → Queues tab to see:
- Message counts and rates
- Consumer connections
- Dead letter queues

### Database Queries
```sql
-- Check saga states
SELECT * FROM saga_state ORDER BY created_at DESC;

-- View order timeline
SELECT * FROM order_timeline WHERE order_id = 'your-order-id';

-- Check system logs
SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT 50;
```

## Troubleshooting

### Services Not Starting
```bash
# Check Docker memory allocation (needs 4GB+)
docker system info | grep Memory

# Rebuild specific service
docker-compose up --build api-gateway
```

### RabbitMQ Connection Issues
- Wait 30-60 seconds after startup for RabbitMQ to initialize
- Check RabbitMQ logs: `docker-compose logs rabbitmq`

### Database Issues
```bash
# Reset database
docker-compose down -v
docker-compose up --build
```

## Technology Stack

- **Frontend**: React, Vite, TailwindCSS
- **API Gateway**: Flask 3.0, Gunicorn
- **Services**: Python 3.11, Flask
- **Database**: PostgreSQL 15
- **Message Broker**: RabbitMQ 3.12 with Management Plugin
- **Containerization**: Docker, Docker Compose
- **Authentication**: JWT (PyJWT)
- **Password Hashing**: bcrypt
