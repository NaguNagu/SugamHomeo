-- Sugam Homeo production hardening migration.
-- Run after schema.sql and seed-profiles.sql.

create or replace function public.next_patient_number()
returns text
language plpgsql security definer set search_path = public
as $$
declare next_number integer;
begin
  perform pg_advisory_xact_lock(8347201);
  select coalesce(max(nullif(regexp_replace(patient_number, '[^0-9]', '', 'g'), '')::integer), 0) + 1
    into next_number from public.patients;
  return 'SH-' || lpad(next_number::text, 6, '0');
end;
$$;

alter table public.patients alter column patient_number set default public.next_patient_number();

revoke all on function public.next_patient_number() from public, anon;
grant execute on function public.next_patient_number() to authenticated;
revoke all on function public.next_visit_number(uuid) from public, anon;
grant execute on function public.next_visit_number(uuid) to authenticated;
revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles', 'patients', 'appointments', 'visits', 'consultations', 'prescriptions', 'medication_dispatches'] loop
    execute format('drop trigger if exists set_%s_updated_at on public.%I', table_name, table_name);
    execute format('create trigger set_%s_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

drop function if exists public.create_visit_bundle(uuid, text, text, numeric, numeric, text, text);

create or replace function public.create_visit_bundle(
  p_patient_id uuid,
  p_consultation_text text,
  p_medication_text text,
  p_medicine_value numeric,
  p_paid_amount numeric default 0,
  p_payment_method text default null,
  p_input_method text default 'typed',
  p_appointment_id uuid default null
)
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  next_number integer;
  new_visit_id uuid;
  new_prescription_id uuid;
begin
  if public.current_app_role() <> 'doctor' then raise exception 'Only doctors can create visits'; end if;
  if p_medicine_value < 0 or p_paid_amount < 0 then raise exception 'Amounts cannot be negative'; end if;
  if p_appointment_id is not null and not exists (select 1 from public.appointments where id = p_appointment_id and patient_id = p_patient_id) then raise exception 'Appointment does not belong to this patient'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text, 0));
  select coalesce(max(visit_number), 0) + 1 into next_number from public.visits where patient_id = p_patient_id;
  insert into public.visits (patient_id, appointment_id, visit_number, created_by) values (p_patient_id, p_appointment_id, next_number, auth.uid()) returning id into new_visit_id;
  insert into public.consultations (visit_id, consultation_text, input_method, doctor_id) values (new_visit_id, p_consultation_text, p_input_method, auth.uid());
  insert into public.prescriptions (visit_id, medication_text, medicine_value, created_by) values (new_visit_id, p_medication_text, p_medicine_value, auth.uid()) returning id into new_prescription_id;
  if p_paid_amount > 0 then insert into public.payments (visit_id, amount, payment_method, received_by) values (new_visit_id, p_paid_amount, p_payment_method, auth.uid()); end if;
  insert into public.medication_dispatches (visit_id, prescription_id, status) values (new_visit_id, new_prescription_id, 'pending');
  update public.visits set status = 'completed', completed_at = now(), updated_at = now() where id = new_visit_id;
  if p_appointment_id is not null then update public.appointments set status = 'completed', updated_at = now() where id = p_appointment_id and patient_id = p_patient_id; end if;
  return jsonb_build_object('visit_id', new_visit_id, 'visit_number', next_number, 'prescription_id', new_prescription_id);
end;
$$;

revoke all on function public.create_visit_bundle(uuid, text, text, numeric, numeric, text, text, uuid) from public, anon;
grant execute on function public.create_visit_bundle(uuid, text, text, numeric, numeric, text, text, uuid) to authenticated;

create or replace function public.complete_dispatch(
  p_dispatch_id uuid,
  p_method public.dispatch_method,
  p_courier_name text default null,
  p_awb_number text default null,
  p_amount_received numeric default 0
)
returns boolean
language plpgsql security invoker set search_path = public
as $$
declare target_visit_id uuid;
  current_status public.dispatch_status;
begin
  if public.current_app_role() not in ('doctor', 'pharmacist') then raise exception 'Not authorized to complete dispatch'; end if;
  if p_amount_received < 0 then raise exception 'Amount cannot be negative'; end if;
  select visit_id, status into target_visit_id, current_status from public.medication_dispatches where id = p_dispatch_id for update;
  if target_visit_id is null then raise exception 'Dispatch not found'; end if;
  if current_status = 'dispatched' then raise exception 'Dispatch has already been completed'; end if;
  if p_method = 'courier' and coalesce(trim(p_courier_name), '') = '' then raise exception 'Courier name is required for courier dispatch'; end if;
  update public.medication_dispatches set status = 'dispatched', dispatch_method = p_method, courier_name = case when p_method = 'courier' then p_courier_name else null end, awb_number = case when p_method = 'courier' then p_awb_number else null end, amount_received = p_amount_received, dispatched_at = now(), dispatched_by = auth.uid(), updated_at = now() where id = p_dispatch_id;
  if p_amount_received > 0 then insert into public.payments (visit_id, amount, payment_method, received_by, notes) values (target_visit_id, p_amount_received, 'pharmacy', auth.uid(), 'Recorded during medication dispatch'); end if;
  return true;
end;
$$;

revoke all on function public.complete_dispatch(uuid, public.dispatch_method, text, text, numeric) from public, anon;
grant execute on function public.complete_dispatch(uuid, public.dispatch_method, text, text, numeric) to authenticated;

create or replace function public.write_audit_log()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare record_id uuid;
begin
  record_id := coalesce((case when TG_OP = 'DELETE' then OLD.id else NEW.id end), null);
  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), lower(TG_OP), TG_TABLE_NAME, record_id,
    case when TG_OP = 'DELETE' then jsonb_build_object('old', to_jsonb(OLD))
         when TG_OP = 'INSERT' then jsonb_build_object('new', to_jsonb(NEW))
         else jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)) end);
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

drop trigger if exists audit_patients on public.patients;
create trigger audit_patients after insert or update or delete on public.patients for each row execute function public.write_audit_log();
drop trigger if exists audit_appointments on public.appointments;
create trigger audit_appointments after insert or update or delete on public.appointments for each row execute function public.write_audit_log();
drop trigger if exists audit_visits on public.visits;
create trigger audit_visits after insert or update or delete on public.visits for each row execute function public.write_audit_log();
drop trigger if exists audit_consultations on public.consultations;
create trigger audit_consultations after insert or update or delete on public.consultations for each row execute function public.write_audit_log();
drop trigger if exists audit_prescriptions on public.prescriptions;
create trigger audit_prescriptions after insert or update or delete on public.prescriptions for each row execute function public.write_audit_log();
drop trigger if exists audit_payments on public.payments;
create trigger audit_payments after insert or update or delete on public.payments for each row execute function public.write_audit_log();
drop trigger if exists audit_dispatches on public.medication_dispatches;
create trigger audit_dispatches after insert or update or delete on public.medication_dispatches for each row execute function public.write_audit_log();

-- Clinical history is preserved: no authenticated client can delete these records.
drop policy if exists "doctor can manage patients" on public.patients;
drop policy if exists "doctor can insert patients" on public.patients;
drop policy if exists "doctor can update patients" on public.patients;
create policy "doctor can insert patients" on public.patients for insert to authenticated with check (public.current_app_role() = 'doctor');
create policy "doctor can update patients" on public.patients for update to authenticated using (public.current_app_role() = 'doctor') with check (public.current_app_role() = 'doctor');
drop policy if exists "doctor can manage appointments" on public.appointments;
drop policy if exists "doctor can insert appointments" on public.appointments;
drop policy if exists "doctor can update appointments" on public.appointments;
create policy "doctor can insert appointments" on public.appointments for insert to authenticated with check (public.current_app_role() = 'doctor');
create policy "doctor can update appointments" on public.appointments for update to authenticated using (public.current_app_role() = 'doctor') with check (public.current_app_role() = 'doctor');
drop policy if exists "doctor can manage visits" on public.visits;
drop policy if exists "doctor can insert visits" on public.visits;
drop policy if exists "doctor can update visits" on public.visits;
create policy "doctor can insert visits" on public.visits for insert to authenticated with check (public.current_app_role() = 'doctor');
create policy "doctor can update visits" on public.visits for update to authenticated using (public.current_app_role() = 'doctor') with check (public.current_app_role() = 'doctor');
drop policy if exists "doctor can manage consultations" on public.consultations;
drop policy if exists "doctor can insert consultations" on public.consultations;
drop policy if exists "doctor can update consultations" on public.consultations;
create policy "doctor can insert consultations" on public.consultations for insert to authenticated with check (public.current_app_role() = 'doctor');
create policy "doctor can update consultations" on public.consultations for update to authenticated using (public.current_app_role() = 'doctor') with check (public.current_app_role() = 'doctor');
drop policy if exists "doctor can manage prescriptions" on public.prescriptions;
drop policy if exists "doctor can insert prescriptions" on public.prescriptions;
drop policy if exists "doctor can update prescriptions" on public.prescriptions;
create policy "doctor can insert prescriptions" on public.prescriptions for insert to authenticated with check (public.current_app_role() = 'doctor');
create policy "doctor can update prescriptions" on public.prescriptions for update to authenticated using (public.current_app_role() = 'doctor') with check (public.current_app_role() = 'doctor');

drop policy if exists "doctor can insert dispatches" on public.medication_dispatches;
create policy "doctor can insert dispatches" on public.medication_dispatches for insert to authenticated with check (public.current_app_role() = 'doctor');

-- Pharmacists need the operational prescription/dispatch data, not clinical consultation notes.
drop policy if exists "users can view consultations" on public.consultations;
drop policy if exists "doctor can view consultations" on public.consultations;
create policy "doctor can view consultations" on public.consultations for select to authenticated using (public.current_app_role() = 'doctor');
