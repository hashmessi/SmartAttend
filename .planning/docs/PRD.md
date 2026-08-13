# 📋 SmartAttend — Product Requirements Document (PRD)
**Version**: 1.0  
**Status**: Approved for Development  
**Date**: August 2026  
**Author**: Antigravity Product Engine

---

## 1. Executive Summary

**SmartAttend** is an institutional AI attendance platform for engineering/degree colleges. It eliminates manual roll-call by enabling faculty to capture a single wide-angle classroom photo, which the system processes to automatically mark attendance and instantly deliver results to the Head of Department's live dashboard.

> [!IMPORTANT]
> The core value proposition: **One photo → Full class attendance → HOD notified — under 30 seconds.**

---

## 2. Problem Space

### 2.1 Current State (Pain)
Every day, across multiple periods, faculty members manually:
1. Call each student's name or roll number
2. Record responses on paper or spreadsheet
3. Compile and send reports to the HOD via WhatsApp/email

This costs **10–15 minutes per class period**, generates inconsistencies, enables **proxy attendance fraud**, and creates reporting lag that prevents timely HOD intervention.

### 2.2 Root Cause Analysis
| Issue | Root Cause |
|---|---|
| Time waste | Manual name-by-name identification |
| Proxy fraud | No biometric verification |
| Reporting delay | Manual data aggregation and submission |
| HOD blind spots | No real-time visibility into class attendance |
| Data loss | Paper records, siloed spreadsheets |

---

## 3. Product Goals

| Goal | Metric | Target |
|---|---|---|
| Speed | Time from photo upload to HOD notification | ≤ 30 seconds |
| Accuracy | Face recognition correct identification rate | ≥ 92% |
| Adoption | Faculty using system within first month | ≥ 80% |
| HOD Satisfaction | HOD dashboard usage frequency | Daily |
| Data Integrity | Zero duplicate or missing attendance records | 100% |

---

## 4. User Personas

### Persona 1 — Dr. Priya (HOD, CSE Department)
- **Goal**: Monitor attendance across all sections without chasing faculty
- **Frustration**: Gets incomplete or delayed reports; can't act on absenteeism in time
- **SmartAttend Need**: Live dashboard showing all sections' attendance the moment class begins

### Persona 2 — Prof. Ramesh (Faculty, 2nd Year CSE-A)
- **Goal**: Mark attendance quickly and get back to teaching
- **Frustration**: 10-minute roll call disrupts lecture flow
- **SmartAttend Need**: Open app → take photo → done. No paperwork.

### Persona 3 — Admin Coordinator (System Admin)
- **Goal**: Manage student database and ensure ML model accuracy
- **Frustration**: Re-enrolling students or updating photos is manual
- **SmartAttend Need**: Simple enrollment portal and model management panel

---

## 5. User Stories

### Epic 1: Student Enrollment & ML Training

| ID | Story | Priority |
|---|---|---|
| US-001 | As an Admin, I can upload multiple portrait photos per student with roll number and department/section metadata so the system generates face embeddings | P0 |
| US-002 | As an Admin, I can trigger ML embedding generation for a batch of students | P0 |
| US-003 | As an Admin, I can update or re-enroll a student's face data | P1 |
| US-004 | As an Admin, I can view enrollment status (enrolled/pending) per student | P1 |

### Epic 2: Classroom Attendance Capture

| ID | Story | Priority |
|---|---|---|
| US-010 | As a Faculty, I can log in and see my assigned classes for the day | P0 |
| US-011 | As a Faculty, I can upload a wide-angle classroom photo for a specific period/class | P0 |
| US-012 | As a Faculty, I can see a real-time processing status indicator after upload | P0 |
| US-013 | As a Faculty, I can review and manually correct the auto-detected attendance before confirming | P1 |
| US-014 | As a Faculty, I can mark attendance for a class even if no photo is available (manual override) | P2 |

### Epic 3: HOD Dashboard & Reporting

| ID | Story | Priority |
|---|---|---|
| US-020 | As a HOD, I can see a live attendance summary for all sections in my department | P0 |
| US-021 | As a HOD, I am instantly notified (real-time) when a class attendance is submitted | P0 |
| US-022 | As a HOD, I can drill down into any section to see individual student roll numbers with present/absent status | P0 |
| US-023 | As a HOD, I can view attendance trends and analytics per student, section, and subject | P1 |
| US-024 | As a HOD, I can export attendance reports in CSV and PDF format | P1 |
| US-025 | As a HOD, I can view a list of chronically absent students (< 75% attendance) | P2 |

### Epic 4: Administration

| ID | Story | Priority |
|---|---|---|
| US-030 | As an Admin, I can create and manage departments, sections, and subjects | P0 |
| US-031 | As an Admin, I can create and manage faculty accounts with section assignments | P0 |
| US-032 | As an Admin, I can view ML model accuracy metrics per department cohort | P1 |

---

## 6. System Architecture

### 6.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER CLIENTS                          │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ Faculty UI   │  │   HOD Dashboard  │  │  Admin Panel     │  │
│  │ (Photo Upload│  │  (Live Attendance│  │ (Enrollment Mgmt │  │
│  │  Portal)     │  │   WebSocket Feed)│  │  User Management)│  │
│  └──────┬───────┘  └────────┬─────────┘  └────────┬─────────┘  │
└─────────┼───────────────────┼─────────────────────┼───────────-┘
          │ HTTPS/REST        │ WebSocket           │ HTTPS/REST
┌─────────▼───────────────────▼─────────────────────▼───────────-┐
│                    NGINX REVERSE PROXY                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                   FastAPI Backend (Python 3.11)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Auth API     │  │ Attendance   │  │  Enrollment API      │  │
│  │ JWT + RBAC   │  │ API          │  │  (ML Trigger)        │  │
│  └──────────────┘  └──────┬───────┘  └────────┬─────────────┘  │
│                           │                    │                 │
│  ┌────────────────────────▼────────────────────▼─────────────┐  │
│  │              ML RECOGNITION PIPELINE                       │  │
│  │  Step 1: RetinaFace → Detect all faces in image           │  │
│  │  Step 2: ArcFace    → Extract 512-d embedding per face    │  │
│  │  Step 3: FAISS      → Nearest-neighbor match vs. DB       │  │
│  │  Step 4: Threshold  → Mark match/unknown (absent)         │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│                   PostgreSQL + pgvector                          │
│  Tables: students, embeddings, attendance_logs,                  │
│           departments, sections, subjects, users, audit_logs     │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 ML Recognition Pipeline (Detailed)

```
ENROLLMENT FLOW:
Portrait Image(s)
     │
     ▼
[RetinaFace Detector]  — Detects face bounding box + 5 landmarks
     │
     ▼
[Face Alignment]  — Normalizes to 112×112 canonical pose
     │
     ▼
[ArcFace Encoder]  — Generates 512-d L2-normalized embedding
     │
     ▼
[PostgreSQL pgvector]  — Stores embedding with student_id FK
     │
     ▼
[FAISS Index Rebuild]  — Updates search index for fast lookup


RECOGNITION FLOW (Photo Upload):
Classroom Photo
     │
     ▼
[RetinaFace Multi-face Detector]  — Returns N face bounding boxes
     │
     ▼
[For each face: ArcFace Encoder]  — Generates 512-d embedding
     │
     ▼
[FAISS Search (L2 distance)]  — Finds top-K nearest neighbors
     │
     ▼
[Confidence Threshold Check]  — distance < 0.6 = MATCH
     │               │
     ▼ MATCH         ▼ NO MATCH
[Mark PRESENT]   [Mark ABSENT]
     │
     ▼
[Attendance Record written to PostgreSQL]
     │
     ▼
[WebSocket Broadcast → HOD Dashboard]
```

### 6.3 Technology Stack Decision

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React 18 + Vite + TypeScript | Fast, type-safe, component-driven |
| **UI Styling** | Vanilla CSS + CSS Variables | Full control, no framework lock-in |
| **State** | Zustand | Lightweight, no boilerplate |
| **Real-time** | WebSocket (native + Socket.io) | Instant HOD push updates |
| **Backend** | FastAPI (Python 3.11) | Async, fast, native ML integration |
| **Auth** | JWT + bcrypt + RBAC | Stateless, secure, role-aware |
| **Face Detection** | RetinaFace (InsightFace) | SOTA multi-face detection in groups |
| **Face Encoding** | ArcFace (InsightFace buffalo_l) | SOTA accuracy (>99% LFW benchmark) |
| **Similarity Search** | FAISS (IVFFlat index) | Sub-millisecond vector search |
| **Database** | PostgreSQL 15 + pgvector | Relational + vector storage unified |
| **ORM** | SQLAlchemy 2.0 + Alembic | Type-safe, migrations supported |
| **Validation** | Pydantic v2 | Request/response contract enforcement |
| **Containerization** | Docker + Docker Compose | Consistent dev + prod environments |
| **Reverse Proxy** | Nginx | Static serving + API routing |
| **Task Queue** | Celery + Redis | Async ML processing, non-blocking |

---

## 7. Database Schema

### Core Tables

```sql
-- Departments
CREATE TABLE departments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    code        VARCHAR(10) UNIQUE NOT NULL,  -- e.g., "CSE", "ECE"
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Sections
CREATE TABLE sections (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    name          VARCHAR(10) NOT NULL,  -- e.g., "A", "B", "C"
    year          SMALLINT NOT NULL,     -- 1, 2, 3, 4
    semester      SMALLINT NOT NULL
);

-- Students
CREATE TABLE students (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roll_number   VARCHAR(20) UNIQUE NOT NULL,
    full_name     VARCHAR(100) NOT NULL,
    section_id    UUID REFERENCES sections(id),
    department_id UUID REFERENCES departments(id),
    is_active     BOOLEAN DEFAULT TRUE,
    enrolled_at   TIMESTAMP DEFAULT NOW()
);

-- Face Embeddings (512-d ArcFace vectors)
CREATE TABLE face_embeddings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  UUID REFERENCES students(id) ON DELETE CASCADE,
    embedding   vector(512) NOT NULL,  -- pgvector type
    quality     FLOAT,                 -- confidence score at enrollment
    created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX ON face_embeddings USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);

-- Subjects
CREATE TABLE subjects (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    code          VARCHAR(20) NOT NULL,
    department_id UUID REFERENCES departments(id),
    year          SMALLINT
);

-- Attendance Sessions
CREATE TABLE attendance_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id      UUID REFERENCES sections(id),
    subject_id      UUID REFERENCES subjects(id),
    faculty_id      UUID REFERENCES users(id),
    photo_ref       VARCHAR(255),          -- internal storage path (not public)
    captured_at     TIMESTAMP NOT NULL,
    processed_at    TIMESTAMP,
    status          VARCHAR(20) DEFAULT 'pending',  -- pending|processing|done|failed
    total_students  INTEGER,
    total_present   INTEGER,
    total_absent    INTEGER
);

-- Individual Attendance Records
CREATE TABLE attendance_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID REFERENCES attendance_sessions(id),
    student_id      UUID REFERENCES students(id),
    status          VARCHAR(10) NOT NULL,  -- present|absent|manual
    confidence      FLOAT,                 -- face match confidence
    is_manual       BOOLEAN DEFAULT FALSE, -- manually overridden by faculty
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Users (Auth)
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(150) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL,  -- admin|hod|faculty
    department_id   UUID REFERENCES departments(id),
    full_name       VARCHAR(100),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

---

## 8. API Contract (Key Endpoints)

### Authentication
```
POST /api/v1/auth/login
  Body: { email, password }
  Returns: { access_token, role, department_id }
```

### Enrollment
```
POST /api/v1/enrollment/student
  Body: { roll_number, full_name, section_id, department_id }
  Returns: { student_id, status }

POST /api/v1/enrollment/photos/{student_id}
  Body: multipart/form-data (portrait images)
  Returns: { embedding_ids[], quality_scores[] }
```

### Attendance
```
POST /api/v1/attendance/upload
  Body: multipart/form-data (classroom_photo, section_id, subject_id, period)
  Returns: { session_id, status: "processing" }

GET /api/v1/attendance/session/{session_id}
  Returns: { status, results: [{ roll_number, name, status, confidence }] }

PATCH /api/v1/attendance/session/{session_id}/override
  Body: { student_id, status: "present"|"absent" }
  Returns: { updated }

POST /api/v1/attendance/session/{session_id}/confirm
  Returns: { confirmed, notified_hod: true }
```

### HOD Dashboard
```
GET /api/v1/hod/dashboard
  Returns: { sections: [{ section, total, present, absent, last_updated }] }

GET /api/v1/hod/section/{section_id}/attendance
  Query: ?date=2026-08-13
  Returns: { records: [{ roll_number, name, status, period, subject }] }

GET /api/v1/hod/reports/export
  Query: ?section_id=...&from=...&to=...&format=csv|pdf
  Returns: file download

WebSocket: ws://host/api/v1/ws/hod/{department_id}
  Events: "attendance_submitted" { section, present, absent, timestamp }
```

---

## 9. Non-Functional Requirements

| Requirement | Specification |
|---|---|
| **Performance** | ML pipeline processes classroom image in < 15 seconds |
| **Scalability** | Supports up to 500 enrolled students per department |
| **Availability** | 99.5% uptime during college hours (8am–6pm) |
| **Security** | JWT auth, HTTPS enforced, no raw image retention post-processing |
| **Accessibility** | WCAG 2.1 AA for all dashboard UI |
| **Browser Support** | Chrome, Firefox, Edge (latest 2 versions) |
| **Image Input** | Min 1920×1080px wide-angle classroom photo |

---

## 10. MVP Success Criteria (Go/No-Go)

- [ ] Faculty can upload classroom photo and receive attendance result in < 30s
- [ ] Recognition accuracy ≥ 92% on test dataset with 30+ students per class
- [ ] HOD dashboard receives real-time push notification within 5s of confirmation
- [ ] HOD can drill down to individual roll numbers with present/absent status
- [ ] Admin can enroll students and trigger embedding generation
- [ ] All 3 role types (Admin, HOD, Faculty) have distinct, functional UIs
- [ ] Data persists correctly with zero duplicate attendance records
- [ ] System runs end-to-end via Docker Compose on local/college server
