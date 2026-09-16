-- Sugam Homeo V1 foundation
-- Run this script in Supabase SQL Editor after creating the project.

create extension if not exists "pgcrypto";

create type public.app_role as enum ('doctor', 'pharmacist');
create type public.appointment_status as enum ('scheduled', 'waiting', 'consulting', 'completed', 'cancelled', 'no_show');
create type public.visit_status as enum ('open', 'completed', 'cancelled');
create type public.dispatch_status as enum ('pending', 'processing', 'dispatched', 'cancelled');
create type public.dispatch_method as enum ('courier', 'c_pickup', 'pickup_service');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'doctor',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  patient_number text unique not null,
  name text not null,
  phone text not null,
  dob date,
  gender text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  status text not null default 'active',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  appointment_date date not null,
  appointment_time time not null,
  status public.appointment_status not null default 'scheduled',
  reason text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  visit_number integer not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status public.visit_status not null default 'open',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(patient_id, visit_number)
);

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid unique not null references public.visits(id) on delete restrict,
  consultation_text text not null default '',
  voice_transcript text,
  input_method text,
  voice_provider text,
  voice_language text,
  doctor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid unique not null references public.visits(id) on delete restrict,
  medication_text text not null default '',
  medicine_value numeric(12,2) not null default 0 check (medicine_value >= 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text,
  received_by uuid not null references public.profiles(id),
  received_at timestamptz not null default now(),
  notes text
);

create table public.medication_dispatches (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid unique not null references public.visits(id) on delete restrict,
  prescription_id uuid not null references public.prescriptions(id) on delete restrict,
  status public.dispatch_status not null default 'pending',
  dispatch_method public.dispatch_method,
  courier_name text,
  awb_number text,
  amount_received numeric(12,2) not null default 0 check (amount_received >= 0),
  dispatched_at timestamptz,
  dispatched_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'dispatched' or dispatched_at is not null)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index patients_search_idx on public.patients using gin (to_tsvector('simple', name || ' ' || patient_number || ' ' || phone));
create index appointments_date_idx on public.appointments (appointment_date, appointment_time);
create index visits_patient_idx on public.visits (patient_id, visit_number desc);
create index payments_visit_idx on public.payments (visit_id, received_at desc);
create index dispatch_status_idx on public.medication_dispatches (status, updated_at desc);

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.visits enable row level security;
alter table public.consultations enable row level security;
alter table public.prescriptions enable row level security;
alter table public.payments enable row level security;
alter table public.medication_dispatches enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create policy "signed in users can view profiles" on public.profiles for select to authenticated using (true);
create policy "doctor and pharmacist can view patients" on public.patients for select to authenticated using (public.current_app_role() in ('doctor', 'pharmacist'));
create policy "doctor can manage patients" on public.patients for all to authenticated using (public.current_app_role() = 'doctor') with check (public.current_app_role() = 'doctor');
create policy "users can view appointments" on public.appointments for select to authenticated using (public.current_app_role() = 'doctor');
create policy "doctor can manage appointments" on public.appointments for all to authenticated using (public.current_app_role() = 'doctor') with check (public.current_app_role() = 'doctor');
create policy "users can view visits" on public.visits for select to authenticated using (public.current_app_role() in ('doctor', 'pharmacist'));
create policy "doctor can manage visits" on public.visits for all to authenticated using (public.current_app_role() = 'doctor') with check (public.current_app_role() = 'doctor');
create policy "users can view consultations" on public.consultations for select to authenticated using (public.current_app_role() in ('doctor', 'pharmacist'));
create policy "doctor can manage consultations" on public.consultations for all to authenticated using (public.current_app_role() = 'doctor') with check (public.current_app_role() = 'doctor');
create policy "users can view prescriptions" on public.prescriptions for select to authenticated using (public.current_app_role() in ('doctor', 'pharmacist'));
create policy "doctor can manage prescriptions" on public.prescriptions for all to authenticated using (public.current_app_role() = 'doctor') with check (public.current_app_role() = 'doctor');
create policy "users can view payments" on public.payments for select to authenticated using (public.current_app_role() in ('doctor', 'pharmacist'));
create policy "doctor and pharmacist can record payments" on public.payments for insert to authenticated with check (public.current_app_role() in ('doctor', 'pharmacist'));
create policy "users can view dispatches" on public.medication_dispatches for select to authenticated using (public.current_app_role() in ('doctor', 'pharmacist'));
create policy "doctor and pharmacist can update dispatches" on public.medication_dispatches for update to authenticated using (public.current_app_role() in ('doctor', 'pharmacist')) with check (public.current_app_role() in ('doctor', 'pharmacist'));
create policy "users can view audit logs" on public.audit_logs for select to authenticated using (public.current_app_role() = 'doctor');

create or replace function public.next_visit_number(target_patient_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare next_number integer;
begin
  select coalesce(max(visit_number), 0) + 1 into next_number from public.visits where patient_id = target_patient_id;
  return next_number;
end;
$$;
