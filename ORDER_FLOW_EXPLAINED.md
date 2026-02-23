# 🚀 Order Creation Flow - Behind the Scenes

## Architecture Overview

```
┌─────────────┐
│   Client    │ (Browser)
│  (React)    │
└──────┬──────┘
       │ HTTP POST /api/orders
       │ (Order details in JSON)
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         DOCKER CONTAINER                            │
│                    🌐 API Gateway (Port 5002)                       │
│  - Receives HTTP request                                            │
│  - JWT authentication (optional)                                    │
│  - Forwards to Middleware Service                                   │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ HTTP POST to middleware:5001
                      │
┌─────────────────────▼───────────────────────────────────────────────┐
│                         DOCKER CONTAINER                            │
│                  ⚙️  Middleware Service (Port 5001)                 │
│                                                                      │
│  STEP 1: Generate Order ID                                          │
│  ├─ Calls PostgreSQL function: generate_order_id()                  │
│  └─ Returns: "ORD-2026-XXXXX"                                       │
│                                                                      │
│  STEP 2: Create Order in Database                                   │
│  ├─ INSERT INTO orders table                                        │
│  ├─ INSERT INTO order_timeline ('created')                          │
│  └─ COMMIT transaction                                              │
│                                                                      │
│  STEP 3: Initiate SAGA Pattern                                      │
│  ├─ Generate saga_id (UUID)                                         │
│  ├─ INSERT INTO saga_state table                                    │
│  ├─ Publish to RabbitMQ: 'saga.order.create'                        │
│  └─ Saga will coordinate distributed transaction                    │
│                                                                      │
│  STEP 4: Publish Event Messages to RabbitMQ                         │
│  ├─ Exchange: 'swifttrack.orders' → 'order.created'                 │
│  ├─ Exchange: 'swifttrack.warehouse' → 'warehouse.receive'          │
│  └─ Exchange: 'swifttrack.notifications' → notification             │
└────────────────────┬─────────────────────────────────────────────────┘
                     │
                     │ Messages Published to RabbitMQ
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         DOCKER CONTAINER                            │
│                  🐰 RabbitMQ (Ports 5672, 15672)                    │
│                                                                      │
│  EXCHANGES (Message Routers):                                       │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │ 📨 swifttrack.orders (type: topic)                        │     │
│  │    Routes: order.created, order.updated, order.status.*   │     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │ 📦 swifttrack.warehouse (type: direct)                    │     │
│  │    Routes: warehouse.receive, warehouse.dispatch          │     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │ 🔔 swifttrack.notifications (type: fanout)                │     │
│  │    Broadcasts to all notification consumers               │     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │ 🎯 swifttrack.saga (type: topic)                          │     │
│  │    Routes: saga.order.create, saga.assign.driver          │     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                      │
│  QUEUES (Message Storage):                                          │
│  ┌─────────────────────┐  ┌─────────────────────┐                  │
│  │  orders.created     │  │  warehouse.receive  │                  │
│  │  (Durable, DLQ)     │  │  (Priority Queue)   │                  │
│  └─────────────────────┘  └─────────────────────┘                  │
│                                                                      │
│  ┌─────────────────────┐  ┌─────────────────────┐                  │
│  │ notifications.email │  │   saga.execute      │                  │
│  │  (Fanout consumer)  │  │  (Saga orchestrator)│                  │
│  └─────────────────────┘  └─────────────────────┘                  │
│                                                                      │
│  MESSAGE FEATURES:                                                  │
│  ✓ Persistent (delivery_mode=2) - survives restart                 │
│  ✓ Dead Letter Queues (DLQ) - failed messages go here              │
│  ✓ Message TTL - 1 hour timeout                                    │
│  ✓ Priority Queues - same_day orders get priority 10               │
│  ✓ Publisher Confirms - guaranteed delivery                        │
└────┬──────────────────────┬──────────────────────┬─────────────────┘
     │                      │                      │
     │                      │                      │
     ▼                      ▼                      ▼
┌────────────┐    ┌─────────────────┐    ┌────────────────────┐
│  DOCKER    │    │     DOCKER      │    │      DOCKER        │
│  WMS       │    │ Notification    │    │ Saga Orchestrator  │
│  Service   │    │    Service      │    │    Service         │
└────────────┘    └─────────────────┘    └────────────────────┘
     │                      │                      │
     │ Consumes from        │ Consumes from        │ Consumes from
     │ warehouse.receive    │ notifications.*      │ saga.execute
     │                      │                      │
     ▼                      ▼                      ▼
Process warehouse      Send email/SMS/         Execute SAGA steps
reserve slot           push notifications      (distributed transaction)


## 🎭 SAGA Pattern - Distributed Transaction Flow

The SAGA Orchestrator ensures data consistency across multiple services:

```
┌──────────────────────────────────────────────────────────────────┐
│              SAGA: order.create (Distributed Transaction)        │
│                                                                   │
│  Coordinator: Saga Orchestrator Container                        │
│  Status: Tracked in PostgreSQL saga_state table                  │
└──────────────────────────────────────────────────────────────────┘

SAGA EXECUTION SEQUENCE:
═══════════════════════════════════════════════════════════════════

STEP 1: Validate Customer
┌─────────────────────────────────────────────────────────┐
│ Service: CMS (Customer Management Service)              │
│ Protocol: SOAP (XML over HTTP)                          │
│ Action: validate_customer                               │
│ Validates: Customer ID exists and is active             │
│ Compensation: None (read-only operation)                │
└─────────────────────────────────────────────────────────┘
          │
          ├─ SUCCESS → Proceed to Step 2
          └─ FAILURE → Saga ends, return error
          
STEP 2: Reserve Warehouse Slot
┌─────────────────────────────────────────────────────────┐
│ Service: WMS (Warehouse Management Service)             │
│ Protocol: Async RabbitMQ Message                        │
│ Queue: warehouse.receive                                │
│ Action: reserve_slot                                    │
│ Reserves: Physical space in warehouse                   │
│ Compensation: release_slot                              │
└─────────────────────────────────────────────────────────┘
          │
          ├─ SUCCESS → Proceed to Step 3
          └─ FAILURE → Run compensation: release_slot
          
STEP 3: Calculate Route Optimization
┌─────────────────────────────────────────────────────────┐
│ Service: ROS (Route Optimization Service)               │
│ Protocol: REST (JSON over HTTP)                         │
│ Action: optimize_route                                  │
│ Calculates: Best delivery route                         │
│ Compensation: cancel_route                              │
└─────────────────────────────────────────────────────────┘
          │
          ├─ SUCCESS → Proceed to Step 4
          └─ FAILURE → Run compensations:
               1. cancel_route
               2. release_slot (from Step 2)
          
STEP 4: Confirm Order
┌─────────────────────────────────────────────────────────┐
│ Service: Middleware                                     │
│ Protocol: Direct database call                          │
│ Action: confirm_order                                   │
│ Updates: Order status to 'confirmed'                    │
│ Compensation: cancel_order                              │
└─────────────────────────────────────────────────────────┘
          │
          ├─ SUCCESS → SAGA COMPLETED ✓
          └─ FAILURE → Run ALL compensations (reverse order):
               1. cancel_order
               2. cancel_route (from Step 3)
               3. release_slot (from Step 2)


COMPENSATION FLOW (If any step fails):
═══════════════════════════════════════════════════════════════════

┌──────────────────────────────────────────────────────────┐
│  Saga Status Changes:                                     │
│  IN_PROGRESS → COMPENSATING → COMPENSATED                │
│                                                           │
│  Steps executed in REVERSE ORDER:                        │
│  ✗ Failed Step                                           │
│  ⮐ Compensate Step N-1                                   │
│  ⮐ Compensate Step N-2                                   │
│  ⮐ Compensate Step N-3                                   │
│  ...                                                      │
│                                                           │
│  Result: System returns to consistent state              │
└──────────────────────────────────────────────────────────┘


## 🐳 Docker Containers Involved

```
docker ps (Active Containers):

┌──────────────────────────┬─────────┬───────────────────────────┐
│ Container Name           │  Port   │ Purpose                   │
├──────────────────────────┼─────────┼───────────────────────────┤
│ swifttrack-postgres      │ 5433    │ PostgreSQL Database       │
│ swifttrack-rabbitmq      │ 5672    │ Message Broker (AMQP)     │
│                          │ 15672   │ Management UI             │
│ swifttrack-api-gateway   │ 5002    │ External API Entry Point  │
│ middleware-service-1     │ 5001    │ Business Logic (Instance1)│
│ middleware-service-2     │ -       │ Business Logic (Instance2)│
│ swifttrack-saga          │ 5007    │ SAGA Orchestrator         │
│ swifttrack-cms           │ 5003    │ Customer Mgmt (SOAP)      │
│ swifttrack-ros           │ 5004    │ Route Optimization (REST) │
│ wms-service-1            │ 5005    │ Warehouse Mgmt (Instance1)│
│ wms-service-2            │ -       │ Warehouse Mgmt (Instance2)│
│ notification-service-1   │ -       │ Email/SMS/Push (Instance1)│
│ notification-service-2   │ -       │ Email/SMS/Push (Instance2)│
└──────────────────────────┴─────────┴───────────────────────────┘

Network: swifttrack-network (bridge)
All containers communicate via internal Docker network
Only API Gateway (5002) and RabbitMQ Management (15672) exposed externally
```


## 📦 RabbitMQ Message Anatomy

When middleware publishes an order message:

```json
// Exchange: swifttrack.orders
// Routing Key: order.created
// Message Properties:
{
  "delivery_mode": 2,              // PERSISTENT (survives broker restart)
  "content_type": "application/json",
  "message_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": 1708675200,
  "headers": {
    "x-priority": 10,               // High priority for same_day orders
    "correlation_id": "saga-123"
  }
}

// Message Body:
{
  "order_id": "ORD-2026-12345",
  "client_id": "c1111111-1111-1111-1111-111111111111",
  "status": "pending",
  "priority": "same_day",
  "timestamp": "2026-02-23T10:30:00Z",
  "saga_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Message Durability Features:**
- ✓ **Persistent Messages**: Stored on disk, survive RabbitMQ restart
- ✓ **Durable Queues**: Queue definitions survive broker restart
- ✓ **Publisher Confirms**: Middleware waits for acknowledgment
- ✓ **Dead Letter Queue**: Failed messages routed to DLQ
- ✓ **Message TTL**: 1 hour timeout, then moved to DLQ
- ✓ **Priority Queue**: Same-day orders processed first


## 💾 Database Operations (PostgreSQL)

### Tables Modified During Order Creation:

```sql
-- 1. ORDERS TABLE
INSERT INTO orders (
    id,                    -- ORD-2026-12345
    client_id,             -- UUID of client
    pickup_address,        -- From form
    delivery_address,      -- From form
    package_weight,        -- From form
    package_type,          -- 'small_box', 'medium_box', etc.
    priority,              -- 'same_day', 'express', 'normal'
    status,                -- 'pending' (initial)
    estimated_delivery,    -- Calculated based on priority
    special_instructions,  -- From form
    created_at,            -- CURRENT_TIMESTAMP
    updated_at             -- CURRENT_TIMESTAMP
) VALUES (...);

-- 2. ORDER_TIMELINE TABLE (Event Sourcing)
INSERT INTO order_timeline (
    order_id,              -- ORD-2026-12345
    status,                -- 'created'
    description,           -- 'Order placed'
    timestamp              -- CURRENT_TIMESTAMP
) VALUES (...);

-- 3. SAGA_STATE TABLE (Saga Pattern Tracking)
INSERT INTO saga_state (
    id,                    -- UUID
    saga_id,               -- UUID
    saga_type,             -- 'order.create'
    current_step,          -- 'initiated'
    status,                -- 'started'
    payload,               -- JSON with order details
    step_states,           -- JSON array of step statuses
    created_at,            -- CURRENT_TIMESTAMP
    updated_at             -- CURRENT_TIMESTAMP
) VALUES (...);
```

### Transaction Isolation:
- **Level**: READ COMMITTED
- **Pattern**: Each service manages its own transaction
- **Consistency**: Ensured by SAGA pattern, not ACID transactions


## 🔄 Complete Flow Timeline

```
T=0ms    Client submits order form
          ↓
T=10ms   API Gateway receives HTTP POST
          ↓
T=15ms   Middleware creates order in PostgreSQL
          ↓
T=20ms   SAGA initiated (saga_id generated)
          ↓
T=25ms   Messages published to RabbitMQ:
         - swifttrack.orders → order.created
         - swifttrack.warehouse → warehouse.receive  
         - swifttrack.notifications → notification
         - swifttrack.saga → saga.order.create
          ↓
T=30ms   HTTP 201 response returned to client
         (Client sees "Order created successfully")
         
         === ASYNCHRONOUS PROCESSING BEGINS ===
          ↓
T=50ms   Saga Orchestrator receives saga.order.create
          ↓
T=100ms  Step 1: CMS validates customer (SOAP call)
          ├─ HTTP POST to cms-service:5003/soap
          └─ Response: Customer validated ✓
          ↓
T=200ms  Step 2: WMS reserves warehouse slot
          ├─ Message to warehouse.receive queue
          └─ WMS confirms reservation ✓
          ↓
T=350ms  Step 3: ROS calculates optimal route
          ├─ HTTP POST to ros-service:5004/optimize
          └─ Response: Route calculated ✓
          ↓
T=400ms  Step 4: Middleware confirms order
          ├─ UPDATE orders SET status='confirmed'
          └─ Status updated ✓
          ↓
T=450ms  SAGA marked as COMPLETED
          ↓
T=500ms  Notification service sends confirmation email
          ↓
T=1000ms Order fully processed and confirmed
```


## 🔍 How to Monitor This in Real-Time

### 1. RabbitMQ Management UI
```bash
# Open in browser:
http://localhost:15672
Username: swifttrack
Password: swifttrack_mq_2026

# Check:
- Queues → See message counts
- Exchanges → View bindings
- Connections → Active consumers
```

### 2. Docker Container Logs
```bash
# Watch all service logs:
docker-compose logs -f

# Watch specific service:
docker logs -f swifttrack-saga
docker logs -f swiftlogistics-middleware-service-1
docker logs -f swifttrack-rabbitmq
```

### 3. PostgreSQL Queries
```sql
-- See order creation:
SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;

-- Track saga execution:
SELECT * FROM saga_state WHERE saga_type = 'order.create' 
ORDER BY created_at DESC;

-- View order timeline:
SELECT * FROM order_timeline WHERE order_id = 'ORD-2026-12345'
ORDER BY timestamp;
```

### 4. Network Traffic
```bash
# Monitor container network:
docker network inspect swifttrack-network

# Check port bindings:
docker port swifttrack-postgres
docker port swifttrack-rabbitmq
```


## ⚠️ Failure Scenarios & Recovery

### Scenario 1: RabbitMQ Down
```
Impact: Messages cannot be published
Recovery: 
- Middleware retries 5 times with exponential backoff
- If still failing, returns HTTP 503 to client
- Client retries later
```

### Scenario 2: Database Connection Lost
```
Impact: Cannot save order
Recovery:
- Connection pool retries (5 attempts, 2s delay)
- If fatal, returns HTTP 500 to client
- Transaction rolled back automatically
```

### Scenario 3: SAGA Step Fails (e.g., Route Optimization)
```
Impact: Order cannot be fully processed
Recovery:
- Saga enters COMPENSATING state
- Executes compensations in reverse:
  1. Release warehouse slot
  2. No route cancellation needed (step failed)
  3. Mark order as failed
- Notification sent to client
- Order status = 'failed' in database
```

### Scenario 4: Container Crashes Mid-Processing
```
Impact: SAGA interrupted
Recovery:
- Docker restarts container (restart: unless-stopped)
- RabbitMQ redelivers unacknowledged messages
- Saga resumes from last persisted state in database
- Idempotent operations prevent duplicate execution
```


## 🎯 Key Architectural Patterns

1. **API Gateway Pattern** - Single entry point for all client requests
2. **Microservices Architecture** - Independently deployable services  
3. **Event-Driven Architecture** - Asynchronous message-based communication
4. **SAGA Pattern** - Distributed transaction management with compensation
5. **Event Sourcing** - Order timeline tracks all state changes
6. **CQRS (Implicit)** - Read/write separation in some services
7. **Circuit Breaker** - Retry logic with exponential backoff
8. **Service Mesh** - Docker network for service discovery

---

**Created: February 23, 2026**  
**System: SwiftTrack Logistics Platform**
