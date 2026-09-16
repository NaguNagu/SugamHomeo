-- Run once after the two Auth users exist.
insert into public.profiles (id, full_name, role, phone)
values
  ('b501f7c7-2abe-4789-a532-22e490a33104', 'Dr. Sugam', 'doctor', '9343711359'),
  ('de8cf4b3-dc5d-41bd-aa40-1e0f598e83b2', 'Sugam Pharmacy', 'pharmacist', '7204744400')
on conflict (id) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  phone = excluded.phone,
  updated_at = now();
