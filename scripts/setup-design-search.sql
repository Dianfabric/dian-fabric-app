-- 대표(디자인)모드에서도 검색 지원 강화:
-- 이름/색번호 개별 매칭 + "이름-색번호" 결합 검색(SUEDE PU-06, W6677#01 등, 구분자 무시) 매칭.
-- 시그니처·반환 동일 → create or replace 만으로 OK. Supabase SQL 에디터에서 1회 실행.

create or replace function list_design_groups(
  p_type text default null,
  p_subtypes text[] default null,
  p_usage text default null,
  p_wide boolean default false,
  p_search text default null,
  p_sort text default 'newest',
  p_limit int default 20,
  p_offset int default 0,
  p_co_min numeric default 0,
  p_li_min numeric default 0,
  p_wo_min numeric default 0,
  p_featured boolean default false,
  p_seed text default ''
)
returns table (
  id uuid, name text, color_code text, image_url text, price_per_yard numeric,
  fabric_type text, pattern_detail text, width_mm int,
  color_count bigint, total_count bigint, total_fabric_count bigint
)
language sql stable as $$
  with filtered as (
    select f.*
    from fabrics f
    where f.is_active = true
      and f.image_url is not null
      and (
        p_type is null
        or (p_type = '커튼' and f.is_curtain_eligible = true)
        or (p_type = '패턴' and f.pattern_detail is not null and f.pattern_detail <> '무지')
        or (p_type not in ('커튼','패턴')
            and p_type = any(string_to_array(replace(f.fabric_type, ' ', ''), ',')))
      )
      and (
        p_subtypes is null
        or exists (select 1 from unnest(p_subtypes) s where f.pattern_detail ilike '%'||s||'%')
      )
      and (p_usage is null or f.usage_types @> array[p_usage])
      and (not p_wide or f.width_mm >= 2000)
      and (p_co_min <= 0 or f.co_percent >= p_co_min)
      and (p_li_min <= 0 or f.li_percent >= p_li_min)
      and (p_wo_min <= 0 or f.wo_percent >= p_wo_min)
      and (
        p_search is null or p_search = ''
        or f.name ilike '%'||p_search||'%'
        or f.color_code ilike '%'||p_search||'%'
        -- 결합 검색: 구분자(공백/하이픈/#) 제거 후 "이름색번호"에 매칭
        or replace(replace(replace(f.name || f.color_code, ' ', ''), '-', ''), '#', '')
           ilike '%' || replace(replace(replace(p_search, ' ', ''), '-', ''), '#', '') || '%'
      )
  ),
  reps as (
    select distinct on (name)
      id, name, color_code, image_url, price_per_yard, fabric_type, pattern_detail, width_mm
    from filtered
    order by name, color_code
  ),
  agg as (
    select name,
           count(*)::bigint as color_count,
           min(price_per_yard) as min_price,
           max(created_at) as max_created,
           bool_or(supplier = 'EK UNIQUE') as featured
    from filtered
    group by name
  ),
  joined as (
    select r.*, a.color_count, a.min_price, a.max_created, a.featured
    from reps r join agg a on a.name = r.name
  )
  select
    id, name, color_code, image_url, price_per_yard, fabric_type, pattern_detail, width_mm,
    color_count,
    count(*) over()::bigint as total_count,
    sum(color_count) over()::bigint as total_fabric_count
  from joined
  order by
    case when p_featured then featured end desc nulls last,
    case when p_seed <> '' then md5(name || p_seed) end,
    case when p_sort = 'name' then name end asc nulls last,
    case when p_sort = 'price_high' then min_price end desc nulls last,
    case when p_sort = 'price_low' then min_price end asc nulls last,
    case when p_sort = 'newest' then max_created end desc nulls last,
    name asc
  limit p_limit offset p_offset;
$$;
