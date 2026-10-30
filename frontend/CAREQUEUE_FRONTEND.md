# CareQueue frontend

Run:  npm install && npm run dev      (backend on :5000, proxied through /api)

Workspace (collapsible sidebar, one page per area)
  /dashboard                 overview
  /dashboard/queue           ICU queue ranked by risk, bed-ready banner, allocate
  /dashboard/beds            bed inventory and status
  /dashboard/admissions      active ICU admissions, close admission
  /dashboard/patients        list, search, register
  /dashboard/patients/[id]   risk, vitals, lab results, activity
  /dashboard/reminders       vitals due (8 minutes)
  /dashboard/model           how priority is calculated (doctor, admin)
  /dashboard/team            create accounts (hospital admin)
  /dashboard/hospitals       platform admin
  /dashboard/messages        platform admin

Needs the backend with the live risk endpoints (/api/risk/*). The sidebar collapse state is remembered in the browser.
