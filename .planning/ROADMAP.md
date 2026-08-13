# 🏗️ SmartAttend — Architecture Plan & Development Roadmap
**Version**: 1.0 | **Status**: Ready for Execution  
**Engine**: Brutal Product Building Execution Engine

---

## Part I — System Architecture

### 1.1 Component Architecture Map

```
┌──────────────────────────────────────────────────────────────────────┐
│                         SMARTATTEND SYSTEM                           │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                       CLIENT LAYER (React 18 + Vite)            │ │
│  │                                                                 │ │
│  │  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │ │
│  │  │  FACULTY PORTAL  │  │  HOD DASHBOARD   │  │ ADMIN PANEL   │  │ │
│  │  │                 │  │                  │  │               │  │ │
│  │  │ • Login         │  │ • Live Section   │  │ • Student     │  │ │
│  │  │ • Class Select  │  │   Overview Cards │  │   Enrollment  │  │ │
│  │  │ • Photo Upload  │  │ • Real-time feed │  │ • Dept/Sec    │  │ │
│  │  │ • Result Review │  │   (WebSocket)    │  │   Management  │  │ │
│  │  │ • Manual Fix    │  │ • Drill-down     │  │ • User Mgmt   │  │ │
│  │  │ • Confirm       │  │ • Analytics      │  │ • Model Stats │  │ │
│  │  └────────┬────────┘  └────────┬─────────┘  └───────┬───────┘  │ │
│  └───────────┼────────────────────┼────────────────────┼──────────┘ │
│              │ REST/HTTPS         │ WebSocket           │ REST       │
│  ┌───────────▼────────────────────▼────────────────────▼──────────┐ │
│  │                    NGINX REVERSE PROXY                          │ │
│  │           /api/* → FastAPI    /*  → React Static               │ │
│  └────────────────────────────┬────────────────────────────────────┘ │
│                               │                                      │
│  ┌────────────────────────────▼────────────────────────────────────┐ │
│  │                  APPLICATION LAYER (FastAPI)                     │ │
│  │                                                                 │ │
│  │  ┌────────────┐ ┌──────────────┐ ┌──────────┐ ┌────────────┐  │ │
│  │  │ Auth       │ │ Attendance   │ │ Enrollment│ │ HOD API    │  │ │
│  │  │ Router     │ │ Router       │ │ Router    │ │ + WS Hub   │  │ │
│  │  └─────┬──────┘ └──────┬───────┘ └────┬─────┘ └─────┬──────┘  │ │
│  │        └───────────────┴──────────────┴──────────────┘         │ │
│  │                         Service Layer                           │ │
│  │  ┌───────────────────────────────────────────────────────────┐  │ │
│  │  │ AttendanceService | EnrollmentService | ReportService      │  │ │
│  │  └──────────────────────────┬────────────────────────────────┘  │ │
│  └─────────────────────────────┼───────────────────────────────────┘ │
│                                │                                      │
│  ┌─────────────────────────────▼───────────────────────────────────┐ │
│  │                  ML PIPELINE LAYER (Celery Workers)              │ │
│  │                                                                 │ │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │ │
│  │  │  ENROLLMENT  │    │  RECOGNITION │    │  INDEX MANAGER   │  │ │
│  │  │  PIPELINE    │    │  PIPELINE    │    │                  │  │ │
│  │  │              │    │              │    │ • FAISS rebuild  │  │ │
│  │  │ 1. RetinaFace│    │ 1. RetinaFace│    │ • Incremental    │  │ │
│  │  │    detect    │    │    multi-det.│    │   add on enroll  │  │ │
│  │  │ 2. Align face│    │ 2. ArcFace   │    │ • Serialize/load │  │ │
│  │  │ 3. ArcFace   │    │    encode N  │    │   from disk      │  │ │
│  │  │    encode    │    │    faces     │    └──────────────────┘  │ │
│  │  │ 4. Store vec │    │ 3. FAISS     │                          │ │
│  │  │    pgvector  │    │    k-NN      │                          │ │
│  │  └──────────────┘    │ 4. Threshold │                          │ │
│  │                      │    classify  │                          │ │
│  │                      └──────────────┘                          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    DATA LAYER                                    │ │
│  │                                                                 │ │
│  │  ┌────────────────────┐    ┌────────────┐    ┌──────────────┐  │ │
│  │  │  PostgreSQL 15     │    │   Redis    │    │  File Store  │  │ │
│  │  │  + pgvector ext.   │    │  (Celery   │    │  (Enrolled   │  │ │
│  │  │                    │    │   Broker + │    │   portrait   │  │ │
│  │  │ • students         │    │   Cache)   │    │   backup +   │  │ │
│  │  │ • face_embeddings  │    └────────────┘    │   FAISS idx) │  │ │
│  │  │ • attendance_*     │                      └──────────────┘  │ │
│  │  │ • departments      │                                         │ │
│  │  │ • sections         │                                         │ │
│  │  │ • users            │                                         │ │
│  │  └────────────────────┘                                         │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

---

### 1.2 ML Pipeline — Technical Specification

#### Face Detection: RetinaFace (InsightFace)
- **Model**: `buffalo_l` (InsightFace pre-trained, 0.6GB)
- **Input**: Any resolution image (min 1920×1080 recommended)
- **Output**: Bounding boxes + 5-point landmarks per detected face
- **Why**: Superior multi-face detection in group/crowd settings vs. MTCNN
- **Config**: `det_size=(640,640)`, `det_thresh=0.5`

#### Face Encoding: ArcFace (InsightFace)
- **Model**: ResNet-50 backbone with ArcFace loss (LFW: 99.77%)
- **Input**: Aligned 112×112 normalized face crop
- **Output**: 512-dimensional L2-normalized embedding vector
- **Why**: State-of-the-art accuracy, sub-100ms inference on CPU

#### Similarity Search: FAISS (IVFFlat)
- **Index type**: `IVFFlat` (Inverted File Index)
- **Metric**: L2 (Euclidean) distance
- **Threshold**: distance < `0.6` → MATCH (tunable via admin settings)
- **Why**: Sub-millisecond search across 500+ student embeddings
- **Persistence**: Serialized `.index` file, rebuilt on new enrollments

#### Enrollment Quality Gates
- Min face area: 5% of image area
- Min face confidence: > 0.9 (RetinaFace score)
- Min portrait images required: 3 per student (preferably 5–8)
- Rejected photos surface a clear UI error message

---

### 1.3 Data Flow — Faculty Uploads Class Photo

```
Faculty clicks "Upload"
        │
        ▼
[Browser] → POST /api/v1/attendance/upload
  multipart: { photo, section_id, subject_id, period }
        │
        ▼
[FastAPI] validates auth + section ownership
        │
        ▼
[FastAPI] saves photo to temp storage, creates AttendanceSession (status=pending)
  Returns { session_id } immediately (non-blocking)
        │
        ▼
[Celery Worker] picks up recognition task
  ├── RetinaFace detects N faces
  ├── ArcFace encodes each face → [emb_1...emb_N]
  ├── FAISS query: for each emb, find nearest student embedding
  ├── Apply threshold → present/absent classification
  ├── Build result set: [{ roll_no, name, status, confidence }]
  ├── Write attendance_records to PostgreSQL
  └── Update session status = "done"
        │
        ▼
[FastAPI] WebSocket broadcasts "attendance_ready" event
        │
        ▼
Faculty UI polls/receives update → shows result table
HOD Dashboard receives live push → updates section card
```

---

### 1.4 Security Architecture

| Threat | Mitigation |
|---|---|
| Unauthorized access | JWT + RBAC (admin/hod/faculty roles enforced per route) |
| Photo spoofing | Quality threshold at enrollment; future: liveness detection |
| Data exposure | Face embeddings stored as vectors, not images |
| SQL injection | SQLAlchemy ORM (parameterized queries only) |
| MITM | HTTPS enforced via Nginx + SSL certificate |
| Brute force | Rate limiting on `/auth/login` (10 req/min) |
| Department leakage | Department ID scoped to JWT claims; HOD restricted to own dept |

---

## Part II — Development Roadmap

> **Delivery Format**: Each phase produces working, committed, testable code.  
> **Phase Rule**: No phase begins until previous phase is verified.

---

### 🗺️ Roadmap Overview

```
MILESTONE 1 — FOUNDATION (Phases 1–3)
  Phase 1: Project Infrastructure & Docker Compose Setup
  Phase 2: Database Schema + FastAPI Core + Auth System
  Phase 3: Student Enrollment Service + ML Enrollment Pipeline

MILESTONE 2 — CORE ENGINE (Phases 4–5)
  Phase 4: Classroom Photo Recognition Pipeline + Celery Worker
  Phase 5: Faculty Upload Portal (React UI)

MILESTONE 3 — HOD INTELLIGENCE (Phases 6–7)
  Phase 6: HOD Dashboard (React) + WebSocket Real-time Feed
  Phase 7: Admin Panel + Report Export (PDF/CSV)

MILESTONE 4 — PRODUCTION READINESS (Phase 8)
  Phase 8: End-to-End Testing, Performance Tuning, Docker Hardening
```

---

### Phase 1 — Project Infrastructure & DevOps Setup

**Goal**: Running, containerized skeleton with all services communicating

#### Deliverables
- `docker-compose.yml` — PostgreSQL + Redis + FastAPI + Celery + React + Nginx
- `backend/` scaffolded FastAPI app (health endpoint)
- `frontend/` Vite React TypeScript project initialized
- `backend/ml/` placeholder structure
- `scripts/init_db.sh` — DB init + pgvector extension install
- `.env.example` with all required env vars documented

#### Verification
```bash
docker compose up -d
curl http://localhost:8000/api/health  # → 200 OK
curl http://localhost:3000             # → React app loads
```

**Estimated Effort**: 1–2 days

---

### Phase 2 — Database + FastAPI Core + Authentication

**Goal**: Complete data layer, auth system, all ORM models, migrations

#### Deliverables
- SQLAlchemy models: `Department`, `Section`, `Student`, `FaceEmbedding`, `User`, `AttendanceSession`, `AttendanceRecord`, `Subject`
- Alembic migration: `001_initial_schema.py`
- Pydantic schemas for all models
- Auth endpoints: `POST /auth/login`, `POST /auth/refresh`
- JWT middleware with role extraction
- RBAC dependency: `require_role("admin")`, `require_role("hod")`, etc.
- Admin seeder: creates default super-admin account

#### Verification
```bash
# Auth test
curl -X POST /api/v1/auth/login -d '{"email":"admin@college.edu","password":"..."}' 
# → 200 with JWT

# Role test (unauthorized)
curl /api/v1/hod/dashboard -H "Authorization: Bearer <faculty_token>"
# → 403 Forbidden
```

**Estimated Effort**: 2–3 days

---

### Phase 3 — Student Enrollment Service + ML Enrollment Pipeline

**Goal**: Admin can enroll students and trigger face embedding generation

#### Deliverables
- `POST /api/v1/enrollment/student` — create student record
- `POST /api/v1/enrollment/photos/{student_id}` — upload portrait photos (multipart)
- `GET /api/v1/enrollment/students` — list with enrollment status
- ML service: `backend/ml/enrollor.py`
  - RetinaFace detect → align → ArcFace encode → store in pgvector
  - Quality gate: rejects blurry/small/low-confidence faces with error message
- Celery task: `tasks.process_enrollment(student_id, image_paths)`
- Admin UI panel (React): enrollment form + photo uploader + student list
- FAISS index builder: `ml/index_manager.py`

#### Verification
- Enroll 5 test students with portrait photos
- Confirm embeddings exist in `face_embeddings` table
- FAISS index builds without errors
- Quality gate rejects a deliberately blurry image

**Estimated Effort**: 3–4 days

---

### Phase 4 — Recognition Pipeline + Attendance Backend

**Goal**: Upload classroom photo → receive accurate attendance results

#### Deliverables
- `POST /api/v1/attendance/upload` — session creation + async task dispatch
- `GET /api/v1/attendance/session/{id}` — polling endpoint
- Celery task: `tasks.process_attendance_session(session_id)`
  - Multi-face detection (RetinaFace)
  - Per-face ArcFace encoding
  - FAISS k-NN match with threshold
  - Write `AttendanceRecord` rows
  - Session status update
- `PATCH /api/v1/attendance/session/{id}/override` — faculty manual correction
- `POST /api/v1/attendance/session/{id}/confirm` — finalize + notify HOD
- WebSocket hub: `backend/app/websocket.py` (broadcasts to dept HOD on confirm)
- Unit tests: pipeline with known test faces (expected vs. actual match)

#### Verification
- Upload group photo of 5 enrolled test students
- Verify all 5 detected and matched
- Test an unknown face → marked absent
- Manual override tested
- WebSocket event fires on confirm

**Estimated Effort**: 4–5 days

---

### Phase 5 — Faculty Upload Portal (React Frontend)

**Goal**: Faculty has a polished, intuitive UI for the entire attendance workflow

#### Deliverables
- Login page (shared with HOD/Admin routing)
- Faculty home: today's schedule / section picker
- Attendance upload page:
  - Drag-drop or camera capture zone
  - Upload progress bar
  - Processing spinner with status polling
  - Results table: roll_no | name | status badge (✅ Present / ❌ Absent) | confidence %
  - Manual toggle per student
  - Confirm button → lock and submit
- Design System: CSS variables, Inter font, dark-mode professional palette
- Responsive: tablet and desktop optimized (classroom tablet use case)

#### Verification
- End-to-end: login → select class → upload photo → see results → confirm
- Verify WebSocket update arrives on HOD side after Faculty confirms

**Estimated Effort**: 3–4 days

---

### Phase 6 — HOD Real-Time Dashboard

**Goal**: HOD has a live, actionable view of all department attendance

#### Deliverables
- HOD Dashboard page (React):
  - Header: Dept name, date, overall stats
  - Section cards grid: Section name | Present count | Absent count | Status badge | Last updated
  - Real-time: WebSocket auto-updates section card without page reload
  - Drill-down modal/page: Section detail with full student list (roll_no, name, present/absent)
  - Date picker: view historical attendance by date
  - Color-coded indicators: green (>75%), amber (60–75%), red (<60%)
- Analytics tab:
  - Per-student attendance % bar chart
  - Section-level trend line chart
- Export button: triggers CSV/PDF download

#### Verification
- Open HOD dashboard → Faculty submits attendance → Section card updates live
- Drill-down shows individual roll numbers correctly
- Historical date view returns correct records

**Estimated Effort**: 3–4 days

---

### Phase 7 — Admin Panel + Reports + System Management

**Goal**: Full system administration and report generation capability

#### Deliverables
- Admin Panel (React):
  - Department management CRUD
  - Section management CRUD (with year/semester)
  - Subject management CRUD
  - Faculty account creation with section assignments
  - Student enrollment wizard (multi-step form + photo upload)
  - ML Stats page: enrolled students count, FAISS index size, avg recognition confidence
- Report Service (FastAPI):
  - `GET /api/v1/reports/attendance` — filtered by section, date range, subject
  - PDF generation: ReportLab / WeasyPrint
  - CSV generation: pandas to_csv
- Report includes: Roll No | Name | Total Classes | Present | Absent | Attendance %

#### Verification
- Full department onboarding via admin panel
- Export CSV: open in Excel, verify all columns and data accurate
- Export PDF: verify formatting, college name header, section info

**Estimated Effort**: 3–4 days

---

### Phase 8 — Integration Testing, Hardening & Production Readiness

**Goal**: Production-grade, battle-tested system ready for college deployment

#### Deliverables
- End-to-end test suite (pytest):
  - Enrollment → Recognition → Attendance cycle
  - Auth boundary tests (role violations)
  - WebSocket notification tests
- Performance baseline:
  - Load test: 30-student class photo processed in < 15s
  - Concurrent sessions: 3 faculty uploading simultaneously
- Docker hardening:
  - Production `docker-compose.prod.yml`
  - Nginx SSL config template
  - Environment-specific configs
  - Health checks on all services
- Security audit:
  - API rate limiting configured
  - CORS policy locked to college domain
  - No sensitive data in logs
- Deployment runbook: `DEPLOYMENT.md` (step-by-step server setup guide)
- `README.md` — full project documentation

#### Verification
- Full system runs from `docker compose up` in fresh environment
- E2E test suite passes: `pytest tests/ -v`
- 30-student group photo recognized in < 15s
- HOD notified within 5s of faculty confirmation
- All security tests pass

**Estimated Effort**: 3–4 days

---

## Part III — Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Low recognition accuracy in dim classroom | High | High | Recommend HD camera + good lighting guidelines to faculty |
| Students with face occlusion (masks, glasses) | Medium | Medium | Enrollment must include photos with accessories; flag low-confidence results |
| FAISS index corruption | Low | High | Rebuild from pgvector on startup; regular snapshots |
| ML model not loading (memory) | Low | High | Docker memory limit set to 4GB min; lazy loading |
| Concurrent photo uploads blocking workers | Medium | Medium | Celery concurrency: 4 workers; Redis queue with task priority |
| Faculty uploads wrong section photo | Medium | Low | Section selection confirmed before upload; manual override available |

---

## Part IV — Estimated Timeline

| Phase | Effort | Cumulative |
|---|---|---|
| Phase 1: Infrastructure | 1–2 days | Week 1 |
| Phase 2: Auth + DB | 2–3 days | Week 1 |
| Phase 3: Enrollment + ML | 3–4 days | Week 2 |
| Phase 4: Recognition Engine | 4–5 days | Week 2–3 |
| Phase 5: Faculty UI | 3–4 days | Week 3 |
| Phase 6: HOD Dashboard | 3–4 days | Week 4 |
| Phase 7: Admin + Reports | 3–4 days | Week 4–5 |
| Phase 8: QA + Hardening | 3–4 days | Week 5–6 |
| **TOTAL** | **~26–34 days** | **~6 weeks** |

---

## Part V — Next Steps

> [!IMPORTANT]
> **Immediate Action**: Run `/gsd-plan-phase 1` to start detailed planning and execution of Phase 1 — Infrastructure & Docker Compose Setup.

1. ✅ **Review this plan** — confirm tech choices, scope, and timeline are aligned
2. 🚀 **Begin Phase 1** — Docker Compose + project skeleton
3. 📸 **Prepare enrollment dataset** — gather 5–8 clear frontal portraits per student
4. 🖥️ **Provision college server** — minimum specs: 8GB RAM, 4 CPU cores, 50GB storage, Ubuntu 22.04

---

*SmartAttend — Built with the Brutal Product Engine. No scope creep. No hallucinations. Ship the correct product.*
