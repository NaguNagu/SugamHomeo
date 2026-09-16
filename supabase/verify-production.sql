-- Read-only production verification. Run after production-hardening.sql.

select
  proname as function_name,
  pg_get_function_identity_arguments(oid) as arguments
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('next_patient_number', 'create_visit_bundle', 'complete_dispatch', 'set_updated_at')
order by proname;

select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('patients', 'consultations', 'medication_dispatches', 'audit_logs')
order by tablename, policyname;

select tgname, tgrelid::regclass as table_name
from pg_trigger
where not tgisinternal
  and tgname like 'audit_%'
order by table_name;
