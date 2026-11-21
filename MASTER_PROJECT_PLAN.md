# BloodConnect – Smart Blood Donor Finder & Emergency Dispatch System
## Master Architecture & Implementation Blueprint

---

## 1. Executive Summary & Problem Definition

### 1.1 The Core Problem
During acute medical emergencies (accidents, critical surgeries, postpartum hemorrhages, and chronic transfusion-dependent conditions like Thalassemia), families and hospital blood banks encounter severe friction in locating willing and physically eligible blood donors within the critical "golden hour." 

Conventional solutions (such as unstructured WhatsApp/social media broadcasts, phone-tree chains, or static donor lists) suffer from fundamental failures:
1. **Severe Privacy Breaches**: Donors' personal phone numbers and home addresses are leaked publicly, leading to spam, harassment, and reluctance to register.
2. **Outdated Availability & Medical Eligibility**: Registries do not track whether a donor has donated within the last 90 days, traveled recently, or had recent medical contraindications.
3. **Fraud & Black Market Exploitation**: Without verification of the receiving patient, attending doctor, and admitted hospital, unmonitored donor networks are vulnerable to commercial blood trafficking and illegal middleman operations.

### 1.2 The Proposed Solution
**BloodConnect** is an on-demand, proximity-aware blood donor discovery and emergency dispatch platform engineered with strict healthcare compliance. Modeled after on-demand dispatch architectures (e.g., Ola/Uber), it matches verified emergency blood requests with nearby, medically eligible donors while maintaining **zero-knowledge contact privacy** until mutual consent is established.

---

## 2. System Workflow & Trust Architecture

```
[ DONOR ONBOARDING ]
  Donor Registers 
    ├── Submits Contact & Blood Group (A+, B+, O+, AB+, etc.)
    ├── Completes Medical Eligibility Questionnaire
    ├── Submits ID/Aadhar (Masked) & Medical Clearance Record
    └── Self-declaration of clean background
         ▼
  Verification Engine (Admin / Compliance)
         ▼
  [ STATUS: VERIFIED DONOR ] ──> Configures Proximity & Availability Toggle (Available / Busy / Cooldown)

---------------------------------------------------------------------------------------------------------

[ EMERGENCY SEEKER WORKFLOW ]
  Seeker / Hospital Creates Urgent Request
    ├── Specifies Patient, Blood Group, Units & Urgency
    ├── Enters Admitted Hospital & Attending Doctor
    └── Uploads Official Prescription / Medical Requisition
         ▼
  Cross-Referencing Engine
    ├── Validates Hospital against Official Licensed Hospital Registry
    ├── Validates Doctor against State Medical Council Registered Doctors
    └── Flags / Rejects unverified or fraudulent requests
         ▼
  [ STATUS: VERIFIED MEDICAL REQUEST ]

---------------------------------------------------------------------------------------------------------

[ PROXIMITY DISPATCH & CONSENT-UNLOCK PROTOCOL ]
  Verified Request Dispatched
         ▼
  Geospatial Matcher computes:
    ├── Compatible Blood Types (e.g., O- universally, AB+ recipients)
    ├── Active Availability Status (Cooldown check: > 90 days since last donation)
    └── Proximity Calculation (Haversine formula within target radius)
         ▼
  Instant Alerts dispatched to matched nearby donors
         ▼
  Donor reviews request details (Hospital, Urgency, Units; Seeker personal PII protected)
         ├── Declines ──> Request continues to poll other nearby eligible donors
         └── Accepts  ──> CONSENT UNLOCKED!
                           ├── Donor identity & verified contact revealed to Seeker
                           ├── Hospital bed coordination initiated
                           └── Upon donation completion: 90-day cooldown auto-engaged
```

---

## 3. Technology Stack & Architectural Standards

| Layer | Selected Technology | Technical Rationale |
| :--- | :--- | :--- |
| **Frontend** | HTML5, CSS3 (Modern Glassmorphism & Medical Theme), Vanilla JavaScript (ES6+ Modules) | Lightweight, maximum performance, zero bundler overhead for college evaluation, direct DOM transparency, cross-browser compatibility. |
| **Backend** | Node.js with Express.js REST API | Asynchronous, non-blocking event-driven I/O ideal for concurrent dispatch handling, clean MVC separation, robust middleware ecosystem. |
| **Database** | MySQL (User-managed instance via MySQL Workbench, connected via `mysql2/promise` connection pooling) | Strict relational integrity, ACID compliance for sensitive medical records, spatial calculation support, clear normalization (3NF). |
| **Authentication** | JSON Web Tokens (JWT) + bcryptjs | Stateless, tamper-proof session management with cryptographic signature, fine-grained Role-Based Access Control (RBAC). |
| **File Handling** | Multer with disk storage & file-type whitelisting | Secure handling of prescription reports and donor verification documents with randomized hashed filenames. |
| **Distance Engine** | Spherical Law of Cosines / Haversine Formula | Accurate geodesic distance calculation in kilometers between seeker's hospital coordinates and donor's registered approximate location. |

---

## 4. Master File & Directory Structure

```text
AdWT Project(FullStack)/
│
├── MASTER_PROJECT_PLAN.md                  # Comprehensive architectural blueprint & phase guide
│
├── backend/
│   ├── config/
│   │   └── db.js                           # MySQL connection pool configuration & health check
│   ├── controllers/
│   │   ├── authController.js               # Registration, login, JWT issuance, profile retrieval
│   │   ├── donorController.js              # Donor verification submission, availability toggle, stats
│   │   ├── requestController.js            # Emergency request submission & legal cross-checking
│   │   ├── matchController.js              # Proximity query, dispatch alerts, donor accept/decline
│   │   └── adminController.js              # Audit queue for donors & medical requisition requests
│   ├── middleware/
│   │   ├── authMiddleware.js               # JWT verification & claims extraction
│   │   ├── roleMiddleware.js               # Role guard: donor, seeker, hospital_admin, system_admin
│   │   ├── uploadMiddleware.js             # Multer configuration for secure PDF/image uploads
│   │   └── errorMiddleware.js              # Centralized exception interception & sanitization
│   ├── routes/
│   │   ├── authRoutes.js                   # /api/auth/* endpoints
│   │   ├── donorRoutes.js                  # /api/donors/* endpoints
│   │   ├── requestRoutes.js                # /api/requests/* endpoints
│   │   ├── matchRoutes.js                  # /api/matches/* endpoints
│   │   └── adminRoutes.js                  # /api/admin/* endpoints
│   ├── utils/
│   │   ├── geoUtils.js                     # Haversine distance calculations in kilometers
│   │   ├── compatibilityUtils.js           # Blood group biological compatibility mapping
│   │   └── validatorUtils.js               # Doctor/hospital verification rules & input sanitizers
│   ├── database/
│   │   ├── schema.sql                      # Reference MySQL DDL (tables, keys, indexes, triggers)
│   │   └── seed.sql                        # Reference seed data (hospitals, doctors, sample donors)
│   ├── uploads/                            # Stored encrypted/hashed document uploads (ignored in git)
│   ├── .env.example                        # Template environment configurations
│   ├── .env                                # Local secrets (DB credentials, JWT key, port)
│   ├── package.json                        # Backend dependencies & scripts
│   └── server.js                           # Express application entry point & router mounting
│
└── frontend/
    ├── index.html                          # Landing portal & public emergency blood finder
    ├── login.html                          # Universal authentication page (all roles)
    ├── register.html                       # Account creation selector (Donor vs. Seeker vs. Hospital)
    ├── donor-register.html                 # Multi-step medical questionnaire & verification upload
    ├── seeker-request.html                 # Emergency blood request form (hospital, doctor, report)
    │
    ├── donor/
    │   ├── dashboard.html                  # Donor control center (live requests, accept/reject, toggle)
    │   └── history.html                    # Past donation records, cooldown tracker & certificate
    │
    ├── seeker/
    │   ├── dashboard.html                  # Live dispatch radar, nearby donors & accepted contact cards
    │   └── my-requests.html                # Request history & fulfillment tracking
    │
    ├── admin/
    │   ├── dashboard.html                  # Verification queue (donor audits & emergency verification)
    │   └── registry.html                   # Hospital & doctor official directory maintenance
    │
    ├── css/
    │   └── style.css                       # Universal design system (cards, badges, navigation, alerts)
    │
    └── js/
        ├── config.js                       # API base configuration & environment detection
        ├── api.js                          # Fetch wrapper handling JWT headers & error toasts
        ├── auth.js                         # Token storage, auth guards, logout handler
        ├── index.js                        # Dedicated script for index.html
        ├── login.js                        # Dedicated script for login.html
        ├── register.js                     # Dedicated script for register.html
        ├── donor-register.js               # Dedicated script for donor-register.html
        ├── seeker-request.js               # Dedicated script for seeker-request.html
        ├── donor-dashboard.js              # Dedicated script for donor/dashboard.html
        ├── donor-history.js                # Dedicated script for donor/history.html
        ├── seeker-dashboard.js             # Dedicated script for seeker/dashboard.html
        ├── seeker-requests.js              # Dedicated script for seeker/my-requests.html
        ├── admin.js                        # Dedicated script for admin/dashboard.html
        └── admin-registry.js               # Dedicated script for admin/registry.html
```

---

## 4.1 Canonical Naming & Domain Consistency Dictionary

To ensure zero naming discrepancies across database enums, backend REST controllers, middleware, and frontend scripts, the following names are established as **canonical across all domains**:

### 1. Canonical User Roles (`users.role`)
* **`donor`**: An individual registered and medically eligible to donate blood.
* **`seeker`**: A patient, family member, or authorized individual requesting emergency blood.
* **`hospital`**: An authorized hospital administrator or licensed blood bank representative.
* **`admin`**: System administrator and compliance officer with audit and directory oversight.

### 2. Canonical Database Entities & Status Enums
* **`users`**: Role enum `('donor', 'seeker', 'hospital', 'admin')`.
* **`donors`**: Availability enum `('available', 'busy', 'cooldown')`. Blood group enum `('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')`.
* **`donor_verifications`**: Verification status enum `('pending', 'verified', 'rejected')`.
* **`verified_hospitals_doctors`**: Entity type enum `('hospital', 'doctor')`.
* **`blood_requests`**: Lifecycle status enum `('pending_audit', 'auto_verified', 'dispatched', 'fulfilled', 'cancelled')`.
* **`request_dispatches`**: Dispatch consent enum `('notified', 'accepted', 'declined')`.
* **`donations_history`**: Audit trail records with 90-day cooldown enforcement (`cooldown_until`).

### 3. Canonical REST API Endpoints & Controller Map
* `/api/auth` ➔ `controllers/authController.js` (Login, Register, Profile)
* `/api/donors` ➔ `controllers/donorController.js` (Onboard, Availability, Alerts)
* `/api/requests` ➔ `controllers/requestController.js` (Create Emergency Requisition, History)
* `/api/matches` ➔ `controllers/matchController.js` (Proximity Search, Dispatch, Accept/Decline, Consent Unlock)
* `/api/admin` ➔ `controllers/adminController.js` (Verification Queue, Official Registry)

### 4. Canonical 1:1 Frontend Page-to-Script Map
* `index.html` ➔ `js/index.js`
* `login.html` ➔ `js/login.js`
* `register.html` ➔ `js/register.js`
* `donor-register.html` ➔ `js/donor-register.js`
* `seeker-request.html` ➔ `js/seeker-request.js`
* `donor/dashboard.html` ➔ `js/donor-dashboard.js`
* `donor/history.html` ➔ `js/donor-history.js`
* `seeker/dashboard.html` ➔ `js/seeker-dashboard.js`
* `seeker/my-requests.html` ➔ `js/seeker-requests.js`
* `admin/dashboard.html` ➔ `js/admin.js`
* `admin/registry.html` ➔ `js/admin-registry.js`
* Shared Modules: `js/config.js`, `js/api.js`, `js/auth.js` | Shared Styles: `css/style.css`
```

---

## 5. Master Phase Breakdown & Two-Part Execution Rules

### The Two-Part Execution Protocol:
For every minor phase, execution strictly follows two deliverables:
* **Part A (Building)**: The functional implementation, code, configuration, or view for that specific phase.
* **Part B (Documentation & Theory)**:
  1. **Technologies Used**: Specific libraries, modules, or standards applied.
  2. **Theoretical Concepts**: Academic and engineering principles (algorithms, protocols, design patterns).
  3. **Engineering Rationale**: Explicit reasons for choosing these tools/patterns over alternatives.
  4. **Integration Mechanics**: How this module interfaces with the rest of the application.
  5. **Practical Walkthrough**: Concrete verification steps and testing results.

---

### =================================================================
### MAJOR PHASE 1: DATABASE (User-Managed Setup)
> *Note: Database schemas and tables will be created directly by the user in MySQL Workbench. We will design the reference DDL specifications and integrate the connection later.*
### =================================================================

#### **Minor Phase 1.1: Relational Schema Design & Table Specifications (`database/schema.sql`)**
* **Part A (Building)**:
  * Provide complete, copy-pasteable MySQL DDL definitions:
    * `users`: Primary auth identities, role types (`donor`, `seeker`, `hospital`, `admin`), phone, verification flag.
    * `donors`: Physical eligibility, blood group (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`), lat/lng, city/area, availability flag, cooldown timestamp.
    * `donor_verifications`: Aadhar reference, document path, background declaration, audit status (`pending`, `verified`, `rejected`).
    * `verified_hospitals_doctors`: Official lookup directory of licensed hospitals and accredited doctors.
    * `blood_requests`: Requisition details, hospital/doctor foreign keys, prescription path, verification state (`pending_audit`, `auto_verified`, `dispatched`, `fulfilled`).
    * `request_dispatches`: Dispatch mapping between requests and notified donors, consent status (`notified`, `accepted`, `declined`).
    * `donations_history`: Completed donation audit trail with 90-day cooldown triggers.
* **Part B (Documentation)**:
  * **Tech Used**: MySQL 8.x DDL, ANSI SQL constraints, InnoDB engine.
  * **Theory**: Third Normal Form (3NF) relational normalization, ACID transactional safety, referential integrity via cascading foreign keys, B-Tree index optimization for composite lookups `(blood_group, is_available)`.
  * **Engineering Rationale**: Why relational SQL is required over NoSQL for medical and consent records (consistency guarantees, strict schema enforcement).
  * **Integration Mechanics**: How the foreign key constraints link the user identity to donor records, verification queues, and dispatch lifecycles.
  * **Practical Walkthrough**: Verifying schema compilation in MySQL Workbench, inspecting relational diagram (EER Diagram).

#### **Minor Phase 1.2: Official Medical Registry & Sample Test Seed Data (`database/seed.sql`)**
* **Part A (Building)**:
  * Provide reference seed script containing:
    * Pre-seeded verified hospitals (names, licenses, cities, coordinates).
    * Pre-seeded authorized doctors with medical council registration numbers.
    * Sample verified donors distributed across realistic coordinate zones for proximity testing.
    * Default system administrator credentials.
* **Part B (Documentation)**:
  * **Tech Used**: SQL `INSERT` statements, mock geographic coordinate plotting.
  * **Theory**: Referential integrity testing, boundary condition validation, synthetic test fixtures.
  * **Engineering Rationale**: Why hardcoding an official medical registry simulates real-world national health portal verification and prevents rogue hospital creation.
  * **Integration Mechanics**: How seed data acts as the baseline ground truth for seeker request cross-checks and dispatch proximity matching.
  * **Practical Walkthrough**: Executing the seed script in MySQL Workbench and verifying baseline row counts across all tables.

---

### =================================================================
### MAJOR PHASE 2: BACKEND ARCHITECTURE & REST APIs
### =================================================================

#### **Minor Phase 2.1: Server Setup, Environment Config & Connection Pooling**
* **Part A (Building)**:
  * Express application initialization in `backend/server.js`.
  * Environment variable management in `.env` and `.env.example`.
  * Connection pool configuration in `backend/config/db.js` using `mysql2/promise`.
  * Baseline server health endpoint (`GET /api/health`).
* **Part B (Documentation)**:
  * **Tech Used**: Node.js, Express 4.x, `dotenv`, `mysql2/promise`, `cors`.
  * **Theory**: Event-driven non-blocking I/O runtime, thread pool vs. event loop, TCP connection pooling mechanics.
  * **Engineering Rationale**: Why connection pools prevent connection exhaustion under emergency traffic spikes compared to single persistent connections.
  * **Integration Mechanics**: Exporting a promise-based query executor used across all MVC controllers.
  * **Practical Walkthrough**: Launching the server, verifying port binding, and querying `/api/health` via cURL or browser.

#### **Minor Phase 2.2: User Authentication Engine (Registration, Hashing & Login)**
* **Part A (Building)**:
  * Implement `authController.js` and `authRoutes.js`.
  * Secure password hashing using `bcryptjs` with salt rounds.
  * User registration and authentication endpoints (`POST /api/auth/register`, `POST /api/auth/login`).
* **Part B (Documentation)**:
  * **Tech Used**: `bcryptjs`, cryptographic salting, Express routing.
  * **Theory**: One-way hash functions, key derivation functions, salting theory to neutralize rainbow table and precomputation attacks.
  * **Engineering Rationale**: Why passwords must never be stored in plaintext or with reversible encryption; selecting optimal salt factor (work factor vs. latency).
  * **Integration Mechanics**: Storing user credentials in `users` table and returning initial user profile payload.
  * **Practical Walkthrough**: Registering a user, inspecting the hashed password string in the DB, testing valid vs. invalid login attempts.

#### **Minor Phase 2.3: JWT Authorization & Role-Based Access Control (RBAC)**
* **Part A (Building)**:
  * Implement `authMiddleware.js` for JWT verification and token decoding.
  * Implement `roleMiddleware.js` for fine-grained role gating (`donor`, `seeker`, `hospital`, `admin`).
  * Protected current-user profile endpoint (`GET /api/auth/me`).
* **Part B (Documentation)**:
  * **Tech Used**: `jsonwebtoken` (JWT), HTTP Bearer Authorization headers.
  * **Theory**: Stateless authentication tokens, cryptographic digital signatures (HMAC SHA-256), Principle of Least Privilege in RBAC.
  * **Engineering Rationale**: Stateless JWTs avoid server-side session memory lookups, enabling horizontal scaling under emergency loads.
  * **Integration Mechanics**: Intercepting inbound HTTP requests, decoding claims, injecting `req.user`, and rejecting unauthorized roles with HTTP 401/403.
  * **Practical Walkthrough**: Generating a token on login, making authenticated requests with `Authorization: Bearer <token>`, testing role-restricted route access.

#### **Minor Phase 2.4: Secure Document Upload Pipeline**
* **Part A (Building)**:
  * Implement `uploadMiddleware.js` using `multer`.
  * Disk storage configuration with unique UUID/timestamp file renaming.
  * Strict MIME-type whitelisting (PDF, JPG, PNG) and file size constraints (max 5MB).
* **Part B (Documentation)**:
  * **Tech Used**: `multer`, `path`, `crypto`, MIME-type validation.
  * **Theory**: Unrestricted file upload attack vectors, path traversal vulnerabilities, executable file payload prevention.
  * **Engineering Rationale**: Why files must never retain user-submitted filenames and must be stored outside public execution directories.
  * **Integration Mechanics**: Middleware consumes `multipart/form-data`, writes sanitized file to disk, and attaches file path to `req.file`.
  * **Practical Walkthrough**: Uploading a valid medical PDF vs. attempting to upload an unauthorized file extension (.exe, .js).

#### **Minor Phase 2.5: Donor Onboarding & Health Eligibility API**
* **Part A (Building)**:
  * Implement `donorController.js` and `donorRoutes.js`.
  * Medical questionnaire validation (age >= 18, weight >= 50kg, no recent surgery/tattoo within cooldown).
  * Aadhar number masking (`XXXXXXXX1234`) and document submission endpoint (`POST /api/donors/onboard`).
  * Donor availability toggle endpoint (`PATCH /api/donors/availability`).
* **Part B (Documentation)**:
  * **Tech Used**: Express validation, regex masking, SQL transactions.
  * **Theory**: Sensitive PII handling, data minimization principle (GDPR/HIPAA considerations for blood registries), WHO blood donation eligibility criteria.
  * **Engineering Rationale**: Why raw government IDs must never be displayed in plain text; why medical criteria checks must be enforced server-side.
  * **Integration Mechanics**: Links donor profile to `users` and `donor_verifications`, setting initial audit status to `pending`.
  * **Practical Walkthrough**: Submitting a donor onboarding package, inspecting masked Aadhar in database, testing availability toggle.

#### **Minor Phase 2.6: Seeker Emergency Request Engine & Legal Cross-Check**
* **Part A (Building)**:
  * Implement `requestController.js` and `requestRoutes.js`.
  * Emergency requisition creation (`POST /api/requests/create`) with prescription upload.
  * Automated cross-referencing routine in `validatorUtils.js`: verifies submitted hospital and attending doctor against `verified_hospitals_doctors`.
  * Auto-approves matching requests to `auto_verified`; routes unverified facilities to `pending_audit`.
* **Part B (Documentation)**:
  * **Tech Used**: SQL subqueries, relational cross-checks, Multer prescription attachments.
  * **Theory**: Anti-fraud mechanisms in healthcare; National Blood Transfusion Council regulations against black-market blood trading.
  * **Engineering Rationale**: Automated cross-referencing against an official registry stops fraudulent blood solicitations instantly without delaying genuine emergencies.
  * **Integration Mechanics**: Validated request transitions to active dispatch queue.
  * **Practical Walkthrough**: Submitting a request with recognized hospital/doctor credentials (auto-verified) vs. unrecognized credentials (flagged for audit).

#### **Minor Phase 2.7: Blood Compatibility & Geodesic Proximity Engine**
* **Part A (Building)**:
  * Implement `compatibilityUtils.js` containing complete ABO and Rh factor compatibility matrix.
  * Implement `geoUtils.js` with Haversine distance formula calculation.
  * Build proximity query in `matchController.js`: retrieves compatible, verified, currently available donors within specified radius (e.g., 25 km).
* **Part B (Documentation)**:
  * **Tech Used**: Spherical trigonometry, Haversine formula, biological matching matrix.
  * **Theory**: Antigens and antibodies in human blood (universal donor O- negative, universal recipient AB+ positive); geodesic distance over the Earth's spherical surface.
  * **Engineering Rationale**: Calculating proximity at the application/query layer allows instantaneous dynamic radius expansion if no donors are found within 5 km.
  * **Integration Mechanics**: Consumes seeker request coordinates and blood group, outputs sorted candidate donor IDs by ascending distance.
  * **Practical Walkthrough**: Testing distance calculation between two known city coordinates and verifying biological donor-recipient compatibility rules.

#### **Minor Phase 2.8: Ola/Uber Style Dispatch & Notification Engine**
* **Part A (Building)**:
  * Implement emergency dispatch logic in `matchController.js` (`POST /api/matches/dispatch/:requestId`).
  * Bulk insertion into `request_dispatches` for all matched candidate donors with status `notified`.
  * Endpoint for donors to fetch incoming active emergency alerts (`GET /api/donors/alerts`).
* **Part B (Documentation)**:
  * **Tech Used**: Batch SQL operations, polling dispatch queue architecture.
  * **Theory**: Ride-hailing dispatch model applied to emergency healthcare; push vs. pull notification patterns; race condition mitigation.
  * **Engineering Rationale**: Broadcasting to multiple nearby donors simultaneously reduces time-to-first-acceptance compared to linear sequential calling.
  * **Integration Mechanics**: Connects emergency requests with targeted donor notification feeds without revealing seeker or donor contact info.
  * **Practical Walkthrough**: Triggering a dispatch for an emergency request and fetching the alert on a candidate donor's session.

#### **Minor Phase 2.9: Privacy-Preserving Consent-Unlock & Cooldown API**
* **Part A (Building)**:
  * Implement donor response endpoint (`POST /api/matches/respond/:dispatchId`) for `accept` or `decline`.
  * Consent-unlock mechanism: contact details (phone, email) remain masked in API responses until status is `accepted`.
  * Donation completion endpoint (`POST /api/matches/complete/:dispatchId`) which records donation and sets 90-day cooldown timestamp (`cooldown_until = NOW() + INTERVAL 90 DAY`, `is_available = 0`).
* **Part B (Documentation)**:
  * **Tech Used**: Conditional SQL projection (`CASE WHEN`), database timestamps, atomic updates.
  * **Theory**: Zero-Knowledge selective disclosure; biological erythrocyte (RBC) regeneration cycle requiring 12 weeks between whole blood donations.
  * **Engineering Rationale**: Strict consent-unlock protects donors from public spam while automated cooldown protects donor health from dangerous over-donation.
  * **Integration Mechanics**: Closes the loop from emergency request -> donor acceptance -> contact sharing -> donation completion -> cooldown engagement.
  * **Practical Walkthrough**: Accepting a request as a donor, verifying contact info reveals on seeker side, marking complete, and checking that cooldown locks the donor's availability.

#### **Minor Phase 2.10: Admin Audit & Facility Registry API**
* **Part A (Building)**:
  * Implement `adminController.js` and `adminRoutes.js`.
  * Endpoints to list pending donor verifications (`GET /api/admin/donors/pending`) and pending blood requests (`GET /api/admin/requests/pending`).
  * Approval/rejection endpoints (`POST /api/admin/donors/:id/audit`, `POST /api/admin/requests/:id/audit`).
  * Official hospital/doctor directory CRUD endpoints.
* **Part B (Documentation)**:
  * **Tech Used**: Admin RBAC enforcement, SQL pagination and filtering.
  * **Theory**: Separation of concerns, supervisory control and compliance auditing in healthcare systems.
  * **Engineering Rationale**: Human-in-the-loop oversight is critical for edge cases where legitimate doctors or rural clinics are not yet in the pre-seeded registry.
  * **Integration Mechanics**: Directly mutates `is_verified` flags in `donors` and `blood_requests` tables, instantly activating them for matching.
  * **Practical Walkthrough**: Logging in as admin, reviewing a pending donor document, approving the donor, and verifying their status transitions to active.

---

### =================================================================
### MAJOR PHASE 3: FRONTEND INTERFACE & USER DASHBOARDS [COMPLETED]
### =================================================================

#### **Minor Phase 3.1: Design System, Core Stylesheet & Shared Layouts** [COMPLETED]
* **Part A (Building)**:
  * Build universal `css/style.css` using modern CSS custom properties (variables for medical crimson, status greens/ambers, dark/light neutrals, card elevations).
  * Design responsive navigation bar, footer, utility classes, and glassmorphic modal overlays.
* **Part B (Documentation)**:
  * **Tech Used**: CSS3 Variables, Flexbox, CSS Grid, Media Queries.
  * **Theory**: Cognitive ergonomics in crisis situations; high-contrast medical design; WCAG 2.1 accessibility standards.
  * **Engineering Rationale**: A single shared stylesheet guarantees uniform branding, rapid rendering, and avoids heavy frontend UI framework dependencies.
  * **Integration Mechanics**: Included across all HTML pages for consistent layout, typography, and responsive behavior.
  * **Practical Walkthrough**: Viewing the design system on desktop, tablet, and mobile viewport sizes.

#### **Minor Phase 3.2: API Client, Authentication State & Route Guards** [COMPLETED]
* **Part A (Building)**:
  * Build `js/config.js` (API endpoints and constants).
  * Build `js/api.js` (centralized async fetch wrapper injecting `Authorization: Bearer <token>` and handling JSON responses/errors).
  * Build `js/auth.js` (session state management, `localStorage` token storage, role-based page guards, and logout cleanup).
* **Part B (Documentation)**:
  * **Tech Used**: ES6 Modules, Fetch API, browser `localStorage`, DOM events.
  * **Theory**: Client-side session management; interceptor pattern in network requests; client-side route protection.
  * **Engineering Rationale**: Centralizing network logic in `api.js` avoids boilerplate fetch calls and ensures standard error handling across all pages.
  * **Integration Mechanics**: Imported by all page-specific JS files to communicate with backend REST endpoints.
  * **Practical Walkthrough**: Testing token storage upon login, verifying automatic redirect when unauthenticated users attempt to access `/donor/dashboard.html`.

#### **Minor Phase 3.3: Public Portal & Emergency Quick-Finder (`index.html`)** [COMPLETED]
* **Part A (Building)**:
  * Build `index.html` and `js/index.js`.
  * Public hero section, emergency quick-finder by blood group and city, live donor count badges.
  * Zero-PII donor search preview (displays count of available donors without exposing names or phone numbers).
* **Part B (Documentation)**:
  * **Tech Used**: Semantic HTML5, dynamic DOM manipulation, aggregate API consumption.
  * **Theory**: Privacy-by-design for public health platforms; emergency call-to-action design.
  * **Engineering Rationale**: Public seekers need instant reassurance of blood availability before registering, but donor privacy must remain strictly protected.
  * **Integration Mechanics**: Consumes public aggregate endpoints without requiring authentication.
  * **Practical Walkthrough**: Performing a public search for "O+" in a given city and verifying aggregate availability numbers appear.

#### **Minor Phase 3.4: Authentication & Onboarding Views** [COMPLETED]
* **Part A (Building)**:
  * Build `login.html`, `register.html`, and `donor-register.html`.
  * Client-side form validation, role selector, and multi-step donor onboarding form (medical checklist, Aadhar masking, document file upload).
  * Connect to `js/donor-register.js` for asynchronous multipart form submission.
* **Part B (Documentation)**:
  * **Tech Used**: HTML5 Form Validation, FormData API, asynchronous file submission.
  * **Theory**: Progressive disclosure UX pattern (breaking intimidating medical forms into consumable steps); client-side sanitization.
  * **Engineering Rationale**: Multi-step forms reduce user drop-off during complex medical registration while enforcing client-side validation before network transmission.
  * **Integration Mechanics**: Posts `FormData` directly to `/api/auth/register` and `/api/donors/onboard`.
  * **Practical Walkthrough**: Completing the multi-step donor registration, uploading sample documents, and verifying redirect to login upon completion.

#### **Minor Phase 3.5: Emergency Request Submission Portal (`seeker-request.html`)** [COMPLETED]
* **Part A (Building)**:
  * Build `seeker-request.html` and `js/seeker-request.js`.
  * Urgent blood requisition form (patient name, blood group, units, hospital, doctor license, prescription file).
  * Real-time auto-complete search against pre-seeded hospital and doctor registry.
* **Part B (Documentation)**:
  * **Tech Used**: Debounced input listeners, dynamic datalist/dropdowns, FormData upload.
  * **Theory**: Input debouncing to minimize server load; UX heuristics for emergency data entry.
  * **Engineering Rationale**: Auto-complete against the verified registry guides seekers to select recognized hospitals, minimizing manual audit delays.
  * **Integration Mechanics**: Submits emergency request payload to `/api/requests/create` and redirects to live dispatch tracker.
  * **Practical Walkthrough**: Typing hospital letters to trigger auto-complete, attaching prescription, submitting, and observing verification badge.

#### **Minor Phase 3.6: Donor Control Center (`donor/dashboard.html` & `history.html`)** [COMPLETED]
* **Part A (Building)**:
  * Build `donor/dashboard.html`, `donor/history.html`, and `js/donor-dashboard.js`.
  * Live status toggle (Available / Busy), incoming emergency alert cards with distance, urgency indicator, and Accept/Decline action buttons.
  * Cooldown timer widget displaying remaining days when under the 90-day cooldown window.
* **Part B (Documentation)**:
  * **Tech Used**: DOM card rendering, CSS pulse animations for urgent alerts, timestamp countdown mathematics.
  * **Theory**: Urgent notification design; cognitive ergonomics under emergency decision making; donor engagement retention.
  * **Engineering Rationale**: Giving donors complete control over their availability toggle and clear distance/urgency context maximizes response rates.
  * **Integration Mechanics**: Polls `/api/donors/alerts` and triggers `/api/matches/respond/:dispatchId`.
  * **Practical Walkthrough**: Receiving a simulated emergency alert on the dashboard, viewing distance and hospital name, and clicking "Accept".

#### **Minor Phase 3.7: Seeker Live Dispatch Radar (`seeker/dashboard.html`)** [COMPLETED]
* **Part A (Building)**:
  * Build `seeker/dashboard.html`, `seeker/my-requests.html`, and `js/seeker-dashboard.js`.
  * Real-time dispatch radar showing dispatched status ("Searching nearby donors...", "X donors notified").
  * Dynamic card flip: once a donor accepts, the card transitions from masked to **UNLOCKED**, revealing donor name, verified contact number, and distance.
* **Part B (Documentation)**:
  * **Tech Used**: Asynchronous status polling, CSS flip/reveal card animations, responsive action triggers.
  * **Theory**: State synchronization in asynchronous dispatch systems; psychological anxiety reduction for seekers waiting for critical blood.
  * **Engineering Rationale**: Ola/Uber style real-time progress indicators keep seekers informed without requiring manual page refreshes.
  * **Integration Mechanics**: Queries `/api/requests/:requestId/status`, receiving updated donor contact details only upon mutual consent.
  * **Practical Walkthrough**: Watching the seeker dashboard dynamically update from "Notified" to "Accepted", unlocking the donor's contact card.

#### **Minor Phase 3.8: Admin Verification & Compliance Portal (`admin/dashboard.html`)** [COMPLETED]
* **Part A (Building)**:
  * Build `admin/dashboard.html`, `admin/registry.html`, and `js/admin.js`.
  * Donor verification review queue (view uploaded Aadhar & medical certificate, one-click Approve/Reject).
  * Flagged emergency request audit queue (inspect doctor/hospital details and prescriptions).
  * Official hospital and doctor directory management interface.
* **Part B (Documentation)**:
  * **Tech Used**: Admin UI data tables, modal document viewer, bulk action handlers.
  * **Theory**: Administrative supervisory control systems; compliance auditing in critical infrastructure.
  * **Engineering Rationale**: Dedicated admin views streamline compliance workflows and provide a single pane of glass for platform oversight.
  * **Integration Mechanics**: Communicates with `/api/admin/*` endpoints with `admin` role authorization.
  * **Practical Walkthrough**: Reviewing a pending donor, clicking "Approve", and verifying the donor immediately appears eligible in the matching pool.

#### **Minor Phase 3.9: Final System Integration & Academic Project Package** [COMPLETED]
* **Part A (Building)**:
  * End-to-end integration testing of complete user journey:
    * Donor registration -> Admin audit -> Seeker request -> Cross-check -> Proximity dispatch -> Donor accept -> Contact unlock -> Donation complete -> 90-day cooldown.
  * Edge case handling (expired cooldowns, multiple donor responses, unverified facilities).
* **Part B (Documentation)**:
  * **Comprehensive Project Report**: Architecture diagrams, schema dictionaries, API references, test case matrix.
  * **Viva & Presentation Defense Guide**: Expected technical questions, design tradeoffs, security answers, and demonstration script.
