# SwiftTrack Logistics - Middleware Architecture Documentation

## SCS2314 - Middleware Architecture Assignment

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Technology Stack](#technology-stack)
4. [Microservices Architecture](#microservices-architecture)
5. [Communication Patterns](#communication-patterns)
6. [SAGA Pattern Implementation](#saga-pattern-implementation)
7. [Resilience Patterns](#resilience-patterns)
8. [Message Queue Architecture](#message-queue-architecture)
9. [Database Design](#database-design)
10. [API Documentation](#api-documentation)
11. [Deployment Guide](#deployment-guide)
12. [Testing Strategy](#testing-strategy)

---

## 1. System Overview

SwiftTrack Logistics is a comprehensive logistics management platform built using a microservices architecture. The system demonstrates key middleware concepts including:

- **Service-Oriented Architecture (SOA)** with distinct bounded contexts
- **SAGA Pattern** for distributed transaction management
- **Event-Driven Architecture** using RabbitMQ message broker
- **Circuit Breaker Pattern** for fault tolerance
- **API Gateway Pattern** for unified access
- **CQRS (Command Query Responsibility Segregation)** elements

### Core Features

- Order lifecycle management
- Real-time delivery tracking via WebSocket
- Route optimization (REST service)
- Customer management (SOAP service)
- Warehouse management (message-driven)
- Notification system (pub/sub)
- Admin analytics dashboard

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    React Frontend (Vite + Tailwind)                  │   │
│  │        [Client Dashboard] [Driver App] [Admin Portal]                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTP/WebSocket
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY LAYER                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      API Gateway (Flask)                             │   │
│  │    • JWT Authentication & Authorization                              │   │
│  │    • Rate Limiting • Request Routing                                 │   │
│  │    • Request/Response Transformation                                 │   │
│  │    • Correlation ID Injection                                        │   │
│  │    Port: 5002                                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    WebSocket Service (Socket.IO)                     │   │
│  │    • Real-time updates • Push notifications                          │   │
│  │    • Order tracking • Driver location                                │   │
│  │    Port: 5006                                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BUSINESS LOGIC LAYER                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │   Middleware    │  │     SAGA        │  │   DLQ Handler   │            │
│  │    Service      │  │  Orchestrator   │  │    Service      │            │
│  │  ─────────────  │  │  ─────────────  │  │  ─────────────  │            │
│  │ • Order logic   │  │ • Transaction   │  │ • Failed msg    │            │
│  │ • State mgmt    │  │   coordination  │  │   processing    │            │
│  │ • Validation    │  │ • Compensation  │  │ • Retry logic   │            │
│  │ Port: 5001      │  │ Port: 5007      │  │ Port: 5008      │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INTEGRATION SERVICES LAYER                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │  CMS Service    │  │  ROS Service    │  │  WMS Service    │            │
│  │  (SOAP/XML)     │  │  (REST/JSON)    │  │  (RabbitMQ)     │            │
│  │  ─────────────  │  │  ─────────────  │  │  ─────────────  │            │
│  │ • Customer      │  │ • Route         │  │ • Warehouse     │            │
│  │   validation    │  │   optimization  │  │   operations    │            │
│  │ • Profile mgmt  │  │ • Distance calc │  │ • Inventory     │            │
│  │ Port: 5003      │  │ Port: 5004      │  │ Port: 5005      │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Notification Service (Pub/Sub)                    │   │
│  │              • Email • SMS • Push • WebSocket Events                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INFRASTRUCTURE LAYER                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │   PostgreSQL    │  │    RabbitMQ     │  │  Shared Utils   │            │
│  │  ─────────────  │  │  ─────────────  │  │  ─────────────  │            │
│  │ • Users         │  │ • Exchanges     │  │ • Circuit       │            │
│  │ • Orders        │  │ • Queues        │  │   Breaker       │            │
│  │ • Saga State    │  │ • DLQ           │  │ • Retry Handler │            │
│  │ • Audit Logs    │  │ • Topic routing │  │ • Idempotency   │            │
│  │ Port: 5432      │  │ Port: 5672      │  │ • Correlation   │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

### Backend Services

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Runtime | Python | 3.11 | Core application runtime |
| Web Framework | Flask | 3.0+ | REST API development |
| WebSocket | Flask-SocketIO | 5.3+ | Real-time communication |
| ORM/Database | psycopg2 | 2.9+ | PostgreSQL adapter |
| Message Queue | Pika | 1.3+ | RabbitMQ client |
| Auth | PyJWT, bcrypt | Latest | JWT tokens, password hashing |

### Frontend

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Framework | React | 19.0 | UI framework |
| Build Tool | Vite | 7.3 | Development/build |
| Styling | Tailwind CSS | 4.2 | Utility-first CSS |
| State | React Context | - | State management |
| WebSocket | Socket.io-client | - | Real-time updates |

### Infrastructure

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Database | PostgreSQL | 15 Alpine | Primary data store |
| Message Broker | RabbitMQ | 3.12 | Async messaging |
| Container | Docker | - | Containerization |
| Orchestration | Docker Compose | - | Multi-container mgmt |

---

## 4. Microservices Architecture

### Service Catalog

| Service | Port | Protocol | Responsibility |
|---------|------|----------|----------------|
| API Gateway | 5002 | HTTP/REST | Entry point, auth, routing |
| Middleware | 5001 | HTTP/REST | Business logic orchestration |
| CMS Service | 5003 | SOAP/XML | Customer management |
| ROS Service | 5004 | REST/JSON | Route optimization |
| WMS Service | 5005 | AMQP | Warehouse management |
| WebSocket | 5006 | WS | Real-time updates |
| SAGA Orchestrator | 5007 | AMQP | Transaction management |
| DLQ Handler | 5008 | HTTP/AMQP | Failed message processing |

### Service Dependencies

```
┌──────────────────────────────────────────────────────────────┐
│                    Service Dependency Graph                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  api-gateway ──────┬─────────► middleware-service            │
│       │            │                   │                     │
│       │            └─────────► websocket-service             │
│       │                               │                      │
│       ▼                               ▼                      │
│  ┌─────────┐                    ┌──────────┐                │
│  │PostgreSQL│◄───────────────────│ RabbitMQ │                │
│  └─────────┘                    └──────────┘                │
│       ▲                               │                      │
│       │            ┌──────────────────┼───────────────┐     │
│       │            ▼                  ▼               ▼     │
│       │     cms-service      ros-service      wms-service   │
│       │            │                  │               │     │
│       └────────────┴──────────────────┴───────────────┘     │
│                                                              │
│                    saga-orchestrator ◄────► dlq-handler      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Communication Patterns

### 5.1 Synchronous Communication

#### REST/JSON (ROS Service)

```
POST /route/optimize
Content-Type: application/json

{
    "driver_id": "DRV-001",
    "order_ids": ["ORD-001", "ORD-002"],
    "origin": {"lat": 6.93, "lon": 79.84},
    "destination": {"lat": 6.90, "lon": 79.86}
}

Response:
{
    "route_id": "RT-001",
    "estimated_time": 45,
    "distance": 12.5,
    "waypoints": [...]
}
```

#### SOAP/XML (CMS Service)

```xml
POST /soap
Content-Type: text/xml

<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:cms="http://swifttrack.com/cms">
    <soapenv:Body>
        <cms:ValidateCustomerRequest>
            <customer_id>1</customer_id>
        </cms:ValidateCustomerRequest>
    </soapenv:Body>
</soapenv:Envelope>

Response:
<soapenv:Envelope>
    <soapenv:Body>
        <cms:ValidateCustomerResponse>
            <cms:is_valid>true</cms:is_valid>
            <cms:customer_name>John Client</cms:customer_name>
        </cms:ValidateCustomerResponse>
    </soapenv:Body>
</soapenv:Envelope>
```

### 5.2 Asynchronous Communication (RabbitMQ)

#### Exchange Types

| Exchange | Type | Purpose |
|----------|------|---------|
| swifttrack.orders | topic | Order events |
| swifttrack.saga | topic | SAGA events |
| swifttrack.warehouse | direct | WMS operations |
| swifttrack.notifications | fanout | Broadcast notifications |
| swifttrack.dlx | direct | Dead letter exchange |

#### Message Flow Example

```
Order Creation Flow:
───────────────────

1. API Gateway → [HTTP] → Middleware Service
                              │
2. Middleware  ──[AMQP]──►  swifttrack.saga (saga.execute)
                              │
3. SAGA Orchestrator receives message
   │
   ├─► [HTTP] → CMS Service (validate customer)
   │
   ├─► [AMQP] → swifttrack.warehouse (warehouse.receive)
   │
   ├─► [HTTP] → ROS Service (optimize route)
   │
   └─► [DB]   → Update order status
                              │
4. SAGA Orchestrator ─[AMQP]─► swifttrack.notifications
                              │
5. Notification Service → WebSocket → Client
```

---

## 6. SAGA Pattern Implementation

### 6.1 Overview

The SAGA pattern ensures data consistency across microservices without distributed transactions. Each saga consists of:

1. **Forward Steps**: Execute business operations
2. **Compensation Steps**: Rollback on failure

### 6.2 Saga Definitions

#### Create Order Saga

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CREATE ORDER SAGA                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Step 1: Validate Customer                                           │
│  ├── Action: CMS → ValidateCustomer (SOAP)                          │
│  └── Compensation: None (read-only)                                  │
│                          │                                           │
│                          ▼                                           │
│  Step 2: Reserve Warehouse Slot                                      │
│  ├── Action: WMS → reserve_slot (AMQP)                              │
│  └── Compensation: WMS → release_slot                                │
│                          │                                           │
│                          ▼                                           │
│  Step 3: Calculate Route                                             │
│  ├── Action: ROS → /route/optimize (REST)                           │
│  └── Compensation: ROS → /route/{id}/cancel                         │
│                          │                                           │
│                          ▼                                           │
│  Step 4: Confirm Order                                               │
│  ├── Action: DB → UPDATE orders SET status='confirmed'              │
│  └── Compensation: DB → UPDATE orders SET status='cancelled'        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.3 State Machine

```
                 ┌─────────────────────────────────────┐
                 │                                     │
     ┌───────────▼───────────┐                        │
     │       STARTED         │                        │
     └───────────┬───────────┘                        │
                 │                                     │
                 ▼                                     │
     ┌───────────────────────┐                        │
     │     IN_PROGRESS       │────────────┐           │
     └───────────┬───────────┘            │           │
                 │                         │           │
        ┌────────┴────────┐               │           │
        │                 │               │           │
        ▼                 ▼               ▼           │
┌───────────────┐  ┌───────────────┐  ┌─────────────┐│
│   COMPLETED   │  │  COMPENSATING │  │   FAILED    ││
└───────────────┘  └───────┬───────┘  └─────────────┘│
                           │                         │
                           ▼                         │
                   ┌───────────────┐                 │
                   │  COMPENSATED  │─────────────────┘
                   └───────────────┘
```

### 6.4 Saga State Persistence

```sql
CREATE TABLE saga_state (
    id VARCHAR(100) PRIMARY KEY,
    saga_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'started',
    current_step INTEGER DEFAULT 0,
    data JSONB,
    step_states JSONB DEFAULT '[]',
    correlation_id VARCHAR(255),
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);
```

---

## 7. Resilience Patterns

### 7.1 Circuit Breaker

Prevents cascading failures when downstream services are unavailable.

```
                    Circuit Breaker States
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│    ┌──────────┐                         ┌──────────┐       │
│    │  CLOSED  │────failure_threshold───►│   OPEN   │       │
│    │(Allowing)│                         │(Blocking)│       │
│    └────┬─────┘                         └────┬─────┘       │
│         │                                     │             │
│         │           ┌───────────┐            │             │
│         │           │ HALF_OPEN │◄───timeout─┘             │
│         │           │ (Testing) │                          │
│         │           └─────┬─────┘                          │
│         │                 │                                │
│         │     success     │    failure                     │
│         ◄─────────────────┤─────────────────►              │
│                           │                  │             │
│                           ▼                  ▼             │
│                      to CLOSED           to OPEN           │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Configuration:
─────────────
• Failure Threshold: 5 failures
• Recovery Timeout: 30 seconds
• Half-Open Max Calls: 3
```

**Usage Example:**

```python
from shared import CircuitBreakerFactory

cms_breaker = CircuitBreakerFactory.get_circuit_breaker(
    'cms-service',
    failure_threshold=5,
    recovery_timeout=30.0
)

def call_cms_service():
    return cms_breaker.execute(lambda: requests.get(CMS_URL))
```

### 7.2 Retry with Exponential Backoff

Handles transient failures with intelligent retry strategy.

```
            Retry Timeline (Exponential Backoff)
────────────────────────────────────────────────────────────
Time:   0s        1s        3s        7s        15s
        │         │         │         │         │
        ▼         ▼         ▼         ▼         ▼
     Attempt 1  Attempt 2  Attempt 3  Attempt 4  Attempt 5
        │         │         │         │         │
        X fail    X fail    X fail    X fail    ✓ success
                  
        └─1s─┘    └──2s──┘  └──4s──┘  └──8s──┘

Formula: delay = base_delay * (2 ^ attempt) + random_jitter
```

**Usage Example:**

```python
from shared import retry_with_backoff

@retry_with_backoff(max_retries=5, base_delay=1.0)
def external_api_call():
    return requests.post(external_url, json=payload)
```

### 7.3 Idempotency

Ensures operations produce the same result regardless of repetition.

```
┌─────────────────────────────────────────────────────────────┐
│                    Idempotency Flow                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Request with Idempotency-Key: "order-123-create"           │
│                      │                                       │
│                      ▼                                       │
│              ┌───────────────┐                              │
│              │ Check Key DB  │                              │
│              └───────┬───────┘                              │
│                      │                                       │
│         ┌────────────┴────────────┐                         │
│         │                         │                         │
│    Key Exists               Key Not Found                   │
│         │                         │                         │
│         ▼                         ▼                         │
│  ┌─────────────┐          ┌─────────────┐                  │
│  │ Return      │          │ Store Key   │                  │
│  │ Cached      │          │ (Processing)│                  │
│  │ Response    │          └──────┬──────┘                  │
│  └─────────────┘                 │                         │
│                                  ▼                         │
│                          ┌─────────────┐                   │
│                          │ Execute     │                   │
│                          │ Operation   │                   │
│                          └──────┬──────┘                   │
│                                 │                          │
│                                 ▼                          │
│                          ┌─────────────┐                   │
│                          │ Cache       │                   │
│                          │ Response    │                   │
│                          └─────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.4 Dead Letter Queue (DLQ)

Handles messages that cannot be processed successfully.

```
┌─────────────────────────────────────────────────────────────┐
│                    DLQ Processing Flow                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Message Processing                                          │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────┐                                            │
│  │  Try 1/3    │─────success────► Processing Complete       │
│  └──────┬──────┘                                            │
│         │ fail                                              │
│         ▼                                                   │
│  ┌─────────────┐                                            │
│  │  Try 2/3    │─────success────► Processing Complete       │
│  └──────┬──────┘                                            │
│         │ fail                                              │
│         ▼                                                   │
│  ┌─────────────┐                                            │
│  │  Try 3/3    │─────success────► Processing Complete       │
│  └──────┬──────┘                                            │
│         │ fail                                              │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               DEAD LETTER QUEUE                      │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │ • Message persisted to database             │    │   │
│  │  │ • Metadata: error, retry count, timestamps  │    │   │
│  │  │ • Available for manual review               │    │   │
│  │  │ • Auto-retry scheduled with backoff         │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  DLQ Handler Service (Port 5008)                            │
│  • GET /api/dlq/messages - List failed messages             │
│  • POST /api/dlq/messages/{id}/retry - Manual retry         │
│  • DELETE /api/dlq/queues/{queue}/purge - Purge queue       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Message Queue Architecture

### 8.1 RabbitMQ Configuration

```yaml
Virtual Host: swifttrack_vhost
User: swifttrack
Password: swifttrack_mq_2026

Exchanges:
  - swifttrack.orders (topic, durable)
  - swifttrack.saga (topic, durable)
  - swifttrack.warehouse (direct, durable)
  - swifttrack.notifications (fanout, durable)
  - swifttrack.dlx (direct, durable)

Queues:
  - orders.process (DLQ: orders.process.dlq)
  - saga.execute (DLQ: saga.events.dlq)
  - warehouse.receive
  - warehouse.inventory
  - notifications.send
```

### 8.2 Message Format

```json
{
    "headers": {
        "X-Correlation-ID": "uuid-v4",
        "X-Request-ID": "uuid-v4",
        "X-User-ID": "user-123",
        "X-Published-At": "2026-02-20T10:30:00Z",
        "X-Service": "middleware-service"
    },
    "properties": {
        "delivery_mode": 2,
        "content_type": "application/json",
        "message_id": "uuid-v4",
        "timestamp": 1708426200
    },
    "body": {
        "event_type": "order.created",
        "data": { ... }
    }
}
```

---

## 9. Database Design

### 9.1 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DATABASE SCHEMA (PostgreSQL 15)                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────┐      ┌───────────┐      ┌───────────┐              │
│  │   users   │      │  clients  │      │  drivers  │              │
│  ├───────────┤      ├───────────┤      ├───────────┤              │
│  │ id (PK)   │◄────│ user_id   │      │ user_id   │─────►        │
│  │ email     │      │ company   │      │ vehicle   │              │
│  │ password  │      │ address   │      │ rating    │              │
│  │ name      │      │           │      │ lat/lng   │              │
│  │ role      │      └───────────┘      └───────────┘              │
│  └───────────┘            │                  │                     │
│        │                  │                  │                     │
│        │                  ▼                  │                     │
│        │          ┌───────────────┐          │                     │
│        │          │    orders     │◄─────────┘                     │
│        │          ├───────────────┤                                │
│        │          │ id (PK)       │                                │
│        │          │ client_id(FK) │                                │
│        │          │ driver_id(FK) │                                │
│        │          │ status        │                                │
│        │          │ addresses     │                                │
│        │          └───────────────┘                                │
│        │                  │                                        │
│        │                  ▼                                        │
│        │          ┌───────────────┐    ┌───────────────┐          │
│        │          │order_timeline │    │warehouse_inv  │          │
│        │          ├───────────────┤    ├───────────────┤          │
│        │          │ order_id (FK) │    │ order_id (FK) │          │
│        │          │ status        │    │ location      │          │
│        │          │ timestamp     │    │ status        │          │
│        │          └───────────────┘    └───────────────┘          │
│        │                                                           │
│        │          ┌───────────────┐    ┌───────────────┐          │
│        └─────────►│  saga_state   │    │ dlq_messages  │          │
│                   ├───────────────┤    ├───────────────┤          │
│                   │ id (PK)       │    │ message_id    │          │
│                   │ saga_type     │    │ queue_name    │          │
│                   │ status        │    │ payload       │          │
│                   │ step_states   │    │ error_reason  │          │
│                   │ correlation_id│    │ retry_count   │          │
│                   └───────────────┘    └───────────────┘          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 Key Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| users | Authentication | email, password_hash, role |
| orders | Order management | id, status, client_id, driver_id |
| order_timeline | Tracking history | order_id, status, timestamp |
| saga_state | SAGA persistence | saga_type, status, step_states |
| dlq_messages | Failed messages | queue_name, payload, retry_count |
| idempotency_keys | Request dedup | key, response, expires_at |

---

## 10. API Documentation

### 10.1 Authentication

```
POST /auth/login
─────────────────
Request:
{
    "email": "client@swifttrack.com",
    "password": "password123"
}

Response:
{
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
        "id": 1,
        "email": "client@swifttrack.com",
        "name": "John Client",
        "role": "client"
    }
}
```

### 10.2 Orders

```
POST /api/orders
─────────────────
Headers:
  Authorization: Bearer <token>
  Idempotency-Key: unique-key-123

Request:
{
    "pickup_address": "123 Business Ave, NY",
    "delivery_address": "456 Residential St, Brooklyn",
    "package_type": "small_box",
    "package_weight": 2.5,
    "priority": "express"
}

Response:
{
    "success": true,
    "order": {
        "id": "ORD-006",
        "status": "pending",
        "estimated_delivery": "2026-02-21T17:00:00Z"
    },
    "saga_id": "uuid-v4"
}
```

### 10.3 WebSocket Events

```javascript
// Client Connection
socket.connect('ws://localhost:5006', {
    auth: { token: 'JWT_TOKEN' }
});

// Subscribe to order updates
socket.emit('subscribe_order', { order_id: 'ORD-001' });

// Receive updates
socket.on('order_update', (data) => {
    console.log('Order status:', data.status);
    console.log('Driver location:', data.driver_location);
});
```

---

## 11. Deployment Guide

### 11.1 Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for frontend)
- Python 3.11+ (for local development)

### 11.2 Quick Start

```bash
# Clone repository
git clone <repository-url>
cd swiftlogistics

# Start all services
docker-compose up -d

# Initialize database (if needed)
docker exec -it swifttrack-postgres psql -U swifttrack_user -d swifttrack -f /docker-entrypoint-initdb.d/init.sql

# Apply migrations
docker exec -it swifttrack-postgres psql -U swifttrack_user -d swifttrack -f /path/to/migration_v2.sql

# Start frontend (in separate terminal)
cd ../swifttrack-frontend
npm install
npm run dev
```

### 11.3 Environment Variables

```env
# Database
POSTGRES_PASSWORD=swifttrack_secure_pass_2026
DB_HOST=postgres
DB_PORT=5432

# RabbitMQ
RABBITMQ_USER=swifttrack
RABBITMQ_PASS=swifttrack_mq_2026
RABBITMQ_VHOST=swifttrack_vhost

# JWT
JWT_SECRET_KEY=swifttrack_jwt_secret_key_2026

# Logging
LOG_LEVEL=INFO
```

### 11.4 Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:5173 | React application |
| API Gateway | http://localhost:5002 | Main API endpoint |
| WebSocket | ws://localhost:5006 | Real-time updates |
| RabbitMQ UI | http://localhost:15672 | Message queue management |
| PostgreSQL | localhost:5433 | Database (for TablePlus) |
| DLQ Handler | http://localhost:5008 | DLQ management |

---

## 12. Testing Strategy

### 12.1 Unit Tests

```python
# test_circuit_breaker.py
def test_circuit_breaker_opens_on_failures():
    breaker = CircuitBreaker(failure_threshold=3)
    
    for _ in range(3):
        with pytest.raises(Exception):
            breaker.execute(failing_function)
    
    assert breaker.state == CircuitState.OPEN
```

### 12.2 Integration Tests

```python
# test_saga_execution.py
def test_create_order_saga_success():
    saga_id = str(uuid.uuid4())
    
    SagaOrchestrator.execute_saga(
        saga_id=saga_id,
        saga_type='create_order',
        data={'order_id': 'ORD-TEST', 'client_id': 1}
    )
    
    saga = SagaStateManager.get_saga(saga_id)
    assert saga['status'] == 'completed'
```

### 12.3 End-to-End Test Flow

```
1. Login as client → Verify JWT token
2. Create order → Verify SAGA execution
3. Check order status → Verify state transitions
4. Assign driver → Verify route optimization
5. Complete delivery → Verify notifications
6. Verify WebSocket updates throughout
```

---

## Appendix: Shared Utilities Reference

### A.1 Circuit Breaker

```python
from shared import CircuitBreaker, CircuitBreakerFactory

# Get or create circuit breaker
breaker = CircuitBreakerFactory.get_circuit_breaker(
    'service-name',
    failure_threshold=5,
    recovery_timeout=30.0
)

# Execute with protection
result = breaker.execute(lambda: external_call())
```

### A.2 Retry Handler

```python
from shared import retry_with_backoff, ExponentialBackoff

@retry_with_backoff(max_retries=5, base_delay=1.0)
def unreliable_operation():
    return external_api_call()
```

### A.3 Idempotency

```python
from shared import idempotency_middleware

# Flask middleware
app = Flask(__name__)
idempotency_middleware(app)

# Now all POST/PUT/PATCH requests check Idempotency-Key header
```

### A.4 Correlation

```python
from shared import CorrelationMiddleware, get_current_context

# Add middleware
CorrelationMiddleware(app)

# Access context
context = get_current_context()
logger.info("Processing", correlation_id=context.correlation_id)
```

### A.5 Structured Logging

```python
from shared import get_logger

logger = get_logger('my-service')

logger.info("Request received", path="/api/orders", method="POST")
logger.saga_start(saga_id, saga_type)
logger.circuit_breaker_state('cms-service', 'open')
```

---

**Document Version:** 1.0  
**Last Updated:** February 2026  
**Author:** SwiftTrack Development Team
