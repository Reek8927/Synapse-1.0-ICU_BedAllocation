# Live ICU risk scoring, ML-ranked queue, monitor feed

## 1. .env additions (backend)
MONITOR_API_KEY=<random 32+ chars>
BEDALLOCATION_ML_API_KEY=<same key the ML service uses>
BEDALLOCATION_ML_SERVICE_URL=http://127.0.0.1:8001
# optional tuning
RISK_MODEL_HIGH=0.8   RISK_MODEL_MEDIUM=0.5   RISK_WEIGHT_MODEL=0.5   RISK_WEIGHT_NEWS2=0.5

## 2. ML service: IMPORTANT
Real patients supply ~14 of 40 features, so the default completeness floor (0.5) withholds every score.
Start the ML service with:  BEDALLOCATION_MIN_FEATURE_COMPLETENESS=0.3

## 3. Run
npm run dev            # API
npm run risk:worker    # re-scores the waiting queue every 8 min
npm run simulate:vitals -- --tenant <tenantId> --patients P-001,P-002,P-003 --interval 10 --worsen P-002

## 4. Endpoints (cookie auth + CSRF like the rest of the app)
GET  /api/risk/patients/:patientId            latest risk + ICU recommendation (?refresh=true to recompute)
POST /api/risk/patients/:patientId/score      score now
GET  /api/risk/queue                          ML-ranked waiting queue (?rescore=true)
POST /api/risk/queue/rescore                  re-score everyone and return ranking
POST /api/risk/queue/allocate-next            doctor/admin: highest-ranked patient gets a ready bed (optional {bedId})
POST /api/monitoring/vitals                   header X-Monitor-Key; push vitals from the monitor feed

## 5. How it ranks
priority = 0.5 * ML score + 0.5 * min(NEWS2/10, 1) + small capped waiting-time bonus
ICU recommended: NEWS2 >= 7, or ML >= 0.8, or (ML >= 0.5 and NEWS2 >= 5)
Decision support only: a doctor confirms every allocation.

## 6. Demo data
npm run seed:demo            # creates "demo-hospital": 4 occupied ICU beds + 3 waiting patients (stable / borderline / critical)
npm run seed:demo -- --reset # wipe and recreate

## 7. Manual 8-minute flow (hackathon mode)
1. npm run reminders:worker   -> existing worker raises an "observation due" reminder after 8 min (GET /api/icu/reminders)
2. Nurse measures the patient and submits vitals:  POST /api/patients/:id/observations
   (labs when available:                         POST /api/patients/:id/research-assessments)
3. Both responses now include `risk` (riskLevel, icuRecommendation, priorityScore) and the ICU queue re-ranks immediately.
4. GET /api/risk/queue rows include observationDue + minutesSinceObservation.
