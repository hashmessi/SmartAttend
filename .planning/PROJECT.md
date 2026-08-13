# SmartAttend — AI-Powered Face Recognition Attendance System
## PROJECT.md — Project Context & Configuration

---

## Project Vision

SmartAttend is an institutional-grade, AI-powered attendance management system that replaces error-prone, time-consuming manual attendance processes with an automated face-recognition pipeline.

A faculty member captures a wide-angle photograph of the entire classroom, uploads it to the web portal, and within seconds the system:
1. Detects and identifies every student face in the image
2. Cross-references each face against the enrolled student database per department/section
3. Marks absent students automatically
4. Pushes a real-time attendance report to the HOD dashboard with roll numbers, class, department, and section metadata

---

## Problem Statement

| Pain Point | Current Reality | SmartAttend Solution |
|---|---|---|
| Manual roll-call | 10-15 min per class wasted | < 30 seconds via photo upload |
| Proxy attendance | Hard to detect | Face-biometric eliminates proxy |
| HOD reporting | Faculty submits paper/spreadsheet | Real-time push to HOD dashboard |
| Absent notifications | Delayed or missed | Instant automated reporting |
| Data integrity | Spreadsheets siloed | Centralized PostgreSQL, auditable |

---

## Stakeholders

| Role | Responsibility | System Access |
|---|---|---|
| HOD | Oversees attendance, generates reports | Dashboard full dept view |
| Faculty | Captures class photo, reviews results | Upload portal, per-class view |
| System Admin | Manages enrollment, model retraining | Admin panel, ML pipeline |
| Students | Passive enrolled once | None |

---

## Project Scope v1.0 MVP

### In Scope
- Student face enrollment portal
- Classroom photo upload interface for faculty
- Face detection + recognition ML pipeline (RetinaFace + ArcFace)
- Attendance auto-marking logic (present/absent)
- HOD real-time dashboard with WebSocket live updates
- Department / Section / Roll Number metadata tagging
- Basic report export PDF/CSV
- Role-based access control (Admin, HOD, Faculty)

### Out of Scope
- Mobile app
- Live CCTV/RTSP stream integration
- Liveness detection anti-spoofing
- SMS/Email parent notifications
- Multi-campus support

---

## Constraints

1. Privacy-first: Store face embeddings (vectors), never raw images post-enrollment
2. On-premise first: Initial deployment on college server
3. Department isolation: HOD sees only their department data
4. Accuracy floor: >= 92% recognition accuracy on clear frontal classroom images
5. Response time: Attendance result within 30 seconds of photo upload

---

## Repository Structure (Target)

smart-attendance-system/
  .planning/              GSD project planning artifacts
  backend/                FastAPI application
    app/
      api/                Route handlers
      core/               Config, security, DB
      models/             SQLAlchemy ORM models
      schemas/            Pydantic schemas
      services/           Business logic
    ml/                   ML pipeline
      detector/           RetinaFace face detection
      encoder/            ArcFace embedding extraction
      matcher/            FAISS similarity search
      trainer/            Enrollment and model fine-tuning
    tests/
  frontend/               React Vite TypeScript
    src/
      pages/              HOD Dashboard, Faculty Upload, Admin
      components/         Shared UI components
      hooks/              Custom React hooks WebSocket etc
      services/           API client layer
      store/              Zustand state management
    public/
  docker-compose.yml      Full-stack orchestration
  nginx/                  Reverse proxy config
  scripts/                DB migrations, data seeding, ML setup
