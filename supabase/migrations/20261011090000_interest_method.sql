-- Hypotheek Tracker – rekenmethode voor de verschuldigde rente per hypotheek
-- 'actual'     : werkelijke kalenderdagen tot de betaaldag (standaard, bestaand gedrag);
-- 'thirty_360' : elke maand 30 dagen, renteperiodes t/m de vervaldag (due_day).

alter table public.mortgages
  add column interest_method text not null default 'actual'
    check (interest_method in ('actual', 'thirty_360')),
  add column due_day smallint check (due_day between 1 and 31),
  add constraint mortgages_due_day_required
    check (interest_method <> 'thirty_360' or due_day is not null);

-- create_mortgage neemt rekenmethode en vervaldag voortaan mee.
create or replace function public.create_mortgage(p_mortgage jsonb, p_parts jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_start date;
  v_part jsonb;
  v_part_id uuid;
begin
  if jsonb_array_length(coalesce(p_parts, '[]'::jsonb)) = 0 then
    raise exception 'Een hypotheek heeft minimaal één leningdeel.';
  end if;

  insert into public.mortgages
    (entity_id, name, mortgage_number, start_date, end_date, notes, counterparty_iban, interest_method, due_day)
  values (
    (p_mortgage ->> 'entity_id')::uuid,
    p_mortgage ->> 'name',
    p_mortgage ->> 'mortgage_number',
    (p_mortgage ->> 'start_date')::date,
    nullif(p_mortgage ->> 'end_date', '')::date,
    p_mortgage ->> 'notes',
    nullif(p_mortgage ->> 'counterparty_iban', ''),
    coalesce(nullif(p_mortgage ->> 'interest_method', ''), 'actual'),
    nullif(p_mortgage ->> 'due_day', '')::smallint
  )
  returning id, start_date into v_id, v_start;

  for v_part in select value from jsonb_array_elements(p_parts) loop
    insert into public.loan_parts (mortgage_id, name, principal_cents, agreed_repayment_cents, created_at)
    values (
      v_id,
      v_part ->> 'name',
      (v_part ->> 'principal_cents')::bigint,
      coalesce((v_part ->> 'agreed_repayment_cents')::bigint, 0),
      clock_timestamp()
    )
    returning id into v_part_id;

    insert into public.interest_rate_periods (mortgage_id, loan_part_id, rate_percentage, effective_date)
    values (v_id, v_part_id, (v_part ->> 'rate_percentage')::numeric, v_start);
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.create_mortgage(jsonb, jsonb) from public, anon;
grant execute on function public.create_mortgage(jsonb, jsonb) to authenticated;
