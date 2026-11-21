-- Absences (sick, leave) were missing from the allowed kinds, so they never synced between devices.
-- Staff requests (shift swaps, leave requests) are new.
alter table gateline.demo_state drop constraint if exists demo_state_kind_check;
alter table gateline.demo_state add constraint demo_state_kind_check
  check (kind in ('log', 'reassignment', 'feedback', 'roster', 'airline', 'route', 'person', 'profile', 'request', 'rules', 'period', 'audit', 'charter', 'advice', 'notice', 'absence', 'staffreq'));
