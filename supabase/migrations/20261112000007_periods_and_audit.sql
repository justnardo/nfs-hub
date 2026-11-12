-- DEMO ONLY: roster periods (draft/published, share links) and the change log sync through demo_state.
-- Production: gateline.roster_periods + gateline.audit_log with RLS (managers read all, supervisors write own).
alter table gateline.demo_state drop constraint if exists demo_state_kind_check;
alter table gateline.demo_state add constraint demo_state_kind_check
  check (kind in ('log', 'reassignment', 'feedback', 'roster', 'airline', 'route', 'person', 'profile', 'request', 'rules', 'period', 'audit'));
